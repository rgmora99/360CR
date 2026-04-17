import email
import base64
import imaplib
import logging
import threading
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from decimal import Decimal
from email.header import decode_header, make_header

from django.conf import settings
from django.core.mail import send_mail
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.configuration.models import OrganizationEmailInbox
from apps.customers.models import Customer
from apps.finance.models import Invoice, Product, Purchase, PurchaseInboxInvoice, TaxReport
from apps.finance.serializers import (
    InvoiceCreateSerializer,
    InvoiceReceivablePaymentCreateSerializer,
    InvoiceSerializer,
    ProductSerializer,
    PurchaseCreateSerializer,
    PurchaseInboxSerializer,
    PurchaseSerializer,
    TaxReportSerializer,
)
from apps.loyalty.models import LoyaltyMember
from apps.tenants.access import OrganizationScopedViewMixin

logger = logging.getLogger(__name__)
SYNC_TARGET_YEAR = 2026
SYNC_MAX_MESSAGES = 150
SYNC_MAX_BATCH_SIZE = 500
SYNC_PROGRESS = {}
SYNC_PROGRESS_LOCK = threading.Lock()
SYNC_INVOICE_KEYWORDS = (
    "factura electronica",
    "factura electrónica",
    "tiquete electronico",
    "tiquete electrónico",
    "comprobante electronico",
    "comprobante electrónico",
    "nota credito electronica",
    "nota crédito electrónica",
    "nota debito electronica",
    "nota débito electrónica",
    "electronic invoice",
    "e-invoice",
)
SYNC_XML_DOCUMENT_TYPES = {
    "facturaelectronica",
    "tiqueteelectronico",
    "notacreditoelectronica",
    "notadebitoelectronica",
}


def _xml_find_text(element, path, namespaces=None):
    node = element.find(path, namespaces or {})
    if node is None or node.text is None:
        return ""
    return node.text.strip()


def _parse_decimal(value, default="0.00"):
    raw = (value or "").strip()
    if not raw:
        return Decimal(default)
    return Decimal(raw.replace(",", ""))


def _parse_issue_date(value):
    raw = (value or "").strip()
    if not raw:
        return timezone.localdate()

    for candidate in (raw, raw.replace("Z", "+00:00")):
        try:
            return datetime.fromisoformat(candidate).date()
        except ValueError:
            continue
    return timezone.localdate()


def _parse_sync_date(value, fallback):
    raw = (value or "").strip()
    if not raw:
        return fallback
    return datetime.strptime(raw, "%Y-%m-%d").date()


def _normalize_text(value):
    text = (value or "").strip().lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(character for character in normalized if not unicodedata.combining(character))


def _serialize_json_safe(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return {key: _serialize_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_json_safe(item) for item in value]
    return value


def _build_sync_progress_key(organization_id, date_from, date_to, limit):
    return f"{organization_id}:{date_from.isoformat()}:{date_to.isoformat()}:{limit}"


def _set_sync_progress(progress_key, **updates):
    with SYNC_PROGRESS_LOCK:
        current = dict(SYNC_PROGRESS.get(progress_key, {}))
        current.update(updates)
        current["updated_at"] = timezone.now().isoformat()
        SYNC_PROGRESS[progress_key] = current
        return dict(current)


def _increment_sync_progress(progress_key, **increments):
    with SYNC_PROGRESS_LOCK:
        current = dict(SYNC_PROGRESS.get(progress_key, {}))
        for key, value in increments.items():
            current[key] = current.get(key, 0) + value
        current["updated_at"] = timezone.now().isoformat()
        SYNC_PROGRESS[progress_key] = current
        return dict(current)


def _get_sync_progress(progress_key):
    with SYNC_PROGRESS_LOCK:
        current = SYNC_PROGRESS.get(progress_key)
        return dict(current) if current else None


def _coerce_header_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return str(value)


def _extract_invoice_message_text(message):
    text_chunks = []
    subject = _coerce_header_text(message.get("Subject", ""))
    if subject:
        text_chunks.append(subject)

    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        content_type = (part.get_content_type() or "").lower()
        if content_type not in {"text/plain", "text/html"}:
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        charset = part.get_content_charset() or "utf-8"
        try:
            text_chunks.append(payload.decode(charset, errors="ignore"))
        except LookupError:
            text_chunks.append(payload.decode("utf-8", errors="ignore"))

    return _normalize_text(" ".join(text_chunks)[:5000])


def _extract_invoice_attachments(message):
    xml_payload = None
    has_pdf = False
    pdf_payload = None
    pdf_filename = ""
    attachment_names = []

    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue

        filename = _coerce_header_text(part.get_filename() or "").lower()
        content_type = (part.get_content_type() or "").lower()
        if filename:
            attachment_names.append(filename)

        payload = part.get_payload(decode=True)
        if not payload:
            continue

        if filename.endswith(".pdf") or content_type == "application/pdf":
            has_pdf = True
            if pdf_payload is None:
                pdf_payload = payload
                pdf_filename = filename or "factura.pdf"
        if xml_payload is None and (filename.endswith(".xml") or content_type in {"text/xml", "application/xml"}):
            xml_payload = payload

    return {
        "xml_payload": xml_payload,
        "has_pdf": has_pdf,
        "pdf_payload": pdf_payload,
        "pdf_filename": pdf_filename,
        "attachment_names": attachment_names,
    }


def _extract_xml_document_type(xml_payload):
    if not xml_payload:
        return ""
    try:
        root = ET.fromstring(xml_payload)
    except ET.ParseError:
        return ""
    tag = root.tag or ""
    if "}" in tag:
        tag = tag.split("}", 1)[1]
    return _normalize_text(tag)


def _message_looks_like_invoice(message, attachments):
    normalized_text = _extract_invoice_message_text(message)
    normalized_attachment_names = _normalize_text(" ".join(attachments["attachment_names"]))
    xml_document_type = _extract_xml_document_type(attachments["xml_payload"])
    keyword_match = any(
        keyword in normalized_text or _normalize_text(keyword) in normalized_text or _normalize_text(keyword) in normalized_attachment_names
        for keyword in SYNC_INVOICE_KEYWORDS
    )

    if not attachments["xml_payload"]:
        return False

    return attachments["has_pdf"] or keyword_match or xml_document_type in SYNC_XML_DOCUMENT_TYPES


def _parse_invoice_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)
    namespace_uri = ""
    if root.tag.startswith("{") and "}" in root.tag:
        namespace_uri = root.tag[1:].split("}", 1)[0]

    ns = {"fe": namespace_uri} if namespace_uri else {}
    prefix = "fe:" if namespace_uri else ""

    data = {
        "numeric_key": _xml_find_text(root, f".//{prefix}Clave", ns),
        "invoice_number": _xml_find_text(root, f".//{prefix}NumeroConsecutivo", ns),
        "issue_date": _parse_issue_date(_xml_find_text(root, f".//{prefix}FechaEmision", ns)),
        "supplier_name": _xml_find_text(root, f".//{prefix}Emisor/{prefix}Nombre", ns),
        "supplier_tax_id": _xml_find_text(root, f".//{prefix}Emisor/{prefix}Identificacion/{prefix}Numero", ns),
        "buyer_name": _xml_find_text(root, f".//{prefix}Receptor/{prefix}Nombre", ns),
        "buyer_tax_id": _xml_find_text(root, f".//{prefix}Receptor/{prefix}Identificacion/{prefix}Numero", ns),
        "subtotal": _parse_decimal(_xml_find_text(root, f".//{prefix}ResumenFactura/{prefix}TotalVentaNeta", ns)),
        "tax_total": _parse_decimal(_xml_find_text(root, f".//{prefix}ResumenFactura/{prefix}TotalImpuesto", ns)),
        "total": _parse_decimal(_xml_find_text(root, f".//{prefix}ResumenFactura/{prefix}TotalComprobante", ns)),
        "currency": "CRC",
        "exchange_rate": Decimal("1.0000"),
        "document_type": _extract_xml_document_type(xml_bytes),
        "items": [],
    }

    currency_code = (
        _xml_find_text(root, f".//{prefix}CodigoTipoMoneda/{prefix}CodigoMoneda", ns)
        or _xml_find_text(root, f".//{prefix}ResumenFactura/{prefix}CodigoTipoMoneda/{prefix}CodigoMoneda", ns)
        or _xml_find_text(root, f".//{prefix}CodigoMoneda", ns)
    ).upper()
    if currency_code in {"CRC", "USD"}:
        data["currency"] = currency_code

    exchange_rate_text = (
        _xml_find_text(root, f".//{prefix}CodigoTipoMoneda/{prefix}TipoCambio", ns)
        or _xml_find_text(root, f".//{prefix}ResumenFactura/{prefix}CodigoTipoMoneda/{prefix}TipoCambio", ns)
        or _xml_find_text(root, f".//{prefix}TipoCambio", ns)
    )
    if exchange_rate_text:
        data["exchange_rate"] = _parse_decimal(exchange_rate_text, default="1.0000").quantize(Decimal("0.0001"))

    detail_nodes = root.findall(f".//{prefix}DetalleServicio/{prefix}LineaDetalle", ns)
    for index, item_node in enumerate(detail_nodes, start=1):
        description = _xml_find_text(item_node, f"{prefix}Detalle", ns) or f"Linea {index}"
        quantity = _parse_decimal(_xml_find_text(item_node, f"{prefix}Cantidad", ns), default="1.000")
        unit_price = _parse_decimal(_xml_find_text(item_node, f"{prefix}PrecioUnitario", ns))
        if unit_price == Decimal("0.00"):
            subtotal = _parse_decimal(_xml_find_text(item_node, f"{prefix}SubTotal", ns))
            unit_price = (subtotal / quantity).quantize(Decimal("0.01")) if quantity > 0 else subtotal

        data["items"].append(
            {
                "description": description[:220],
                "quantity": quantity.quantize(Decimal("0.001")),
                "unit_price": unit_price.quantize(Decimal("0.01")),
            }
        )

    if not data["items"]:
        base_amount = data["subtotal"] if data["subtotal"] > Decimal("0.00") else data["total"]
        data["items"] = [
            {
                "description": "Factura electronica importada desde correo",
                "quantity": Decimal("1.000"),
                "unit_price": base_amount.quantize(Decimal("0.01")),
            }
        ]

    if not data["numeric_key"] or len(data["numeric_key"]) != 50 or not data["numeric_key"].isdigit():
        raise ValueError("El XML no incluye una Clave valida de 50 digitos.")
    if not data["invoice_number"]:
        raise ValueError("El XML no incluye NumeroConsecutivo.")
    if not data["supplier_name"]:
        raise ValueError("El XML no incluye el nombre del emisor.")

    return data


def _fetch_email_invoice_payloads(inbox, date_from, date_to, max_messages=SYNC_MAX_MESSAGES, progress_key=None):
    connection_class = imaplib.IMAP4_SSL if inbox.imap_ssl else imaplib.IMAP4
    mailbox = connection_class(inbox.imap_host, inbox.imap_port)
    try:
        mailbox.login(inbox.username, inbox.password)
        status_code, _ = mailbox.select(inbox.folder or "INBOX")
        if status_code != "OK":
            raise ValueError(f"No fue posible abrir la carpeta {inbox.folder or 'INBOX'}.")

        start_date = date_from.strftime("%d-%b-%Y")
        end_date = (date_to + timedelta(days=1)).strftime("%d-%b-%Y")
        # Use ALL so the sync includes both read and unread emails.
        status_code, data = mailbox.search(None, "ALL", "SINCE", start_date, "BEFORE", end_date)
        if status_code != "OK":
            raise ValueError("No fue posible consultar la bandeja del correo.")

        all_message_ids = data[0].split()
        total_candidates = len(all_message_ids)
        ordered_message_ids = list(reversed(all_message_ids))
        safe_limit = max(1, min(int(max_messages or SYNC_MAX_MESSAGES), SYNC_MAX_BATCH_SIZE))
        candidate_ids = ordered_message_ids[:safe_limit]
        if progress_key:
            _set_sync_progress(
                progress_key,
                current_inbox=inbox.email,
                total_candidates=total_candidates,
                selected_candidates=len(candidate_ids),
                message=f"Leyendo correo {inbox.email}",
            )

        payloads = []
        errors = []
        skipped_out_of_range = 0
        skipped_non_invoice = 0
        for message_id in candidate_ids:
            if progress_key:
                _increment_sync_progress(progress_key, scanned_messages=1)
            status_code, parts = mailbox.fetch(message_id, "(RFC822)")
            if status_code != "OK" or not parts:
                continue

            raw_email = next((part[1] for part in parts if isinstance(part, tuple) and len(part) > 1), None)
            if not raw_email:
                continue

            message = email.message_from_bytes(raw_email)
            attachments = _extract_invoice_attachments(message)
            if not _message_looks_like_invoice(message, attachments):
                skipped_non_invoice += 1
                if progress_key:
                    _increment_sync_progress(progress_key, skipped_non_invoice=1)
                continue

            try:
                payload = _parse_invoice_xml(attachments["xml_payload"])
                if payload["issue_date"] < date_from or payload["issue_date"] > date_to:
                    skipped_out_of_range += 1
                    if progress_key:
                        _increment_sync_progress(progress_key, skipped_out_of_range=1)
                    continue
                if attachments["pdf_payload"]:
                    payload["pdf_filename"] = attachments["pdf_filename"] or "factura.pdf"
                    payload["pdf_base64"] = base64.b64encode(attachments["pdf_payload"]).decode("ascii")
                payloads.append(payload)
                if progress_key:
                    _increment_sync_progress(progress_key, processed_messages=1)
            except Exception as exc:
                errors.append(f"Mensaje {message_id.decode(errors='ignore') or '?'}: {exc}")

        logger.info(
            "Sync IMAP inbox=%s date_from=%s date_to=%s candidatos=%s procesados=%s encontrados=%s omitidos_no_factura=%s omitidos_fuera_de_rango=%s errores_parseo=%s truncado=%s",
            inbox.email,
            date_from,
            date_to,
            total_candidates,
            len(candidate_ids),
            len(payloads),
            skipped_non_invoice,
            skipped_out_of_range,
            len(errors),
            total_candidates > len(candidate_ids),
        )
        return payloads, errors, skipped_out_of_range, skipped_non_invoice, total_candidates, len(candidate_ids)
    finally:
        try:
            mailbox.close()
        except Exception:
            pass
        try:
            mailbox.logout()
        except Exception:
            pass


def _sync_email_invoices_for_organization(organization_id, date_from, date_to, limit=SYNC_MAX_MESSAGES, progress_key=None):
    inboxes = OrganizationEmailInbox.objects.filter(organization_id=organization_id, is_active=True).order_by("-is_primary", "id")
    if not inboxes.exists():
        return {
            "created": 0,
            "updated": 0,
            "processed_messages": 0,
            "scanned_messages": 0,
            "total_candidates": 0,
            "skipped_non_invoice": 0,
            "skipped_out_of_range": 0,
            "truncated": False,
            "has_more": False,
            "errors": ["No hay correos IMAP activos configurados para esta organizacion."],
        }

    logger.info(
        "Iniciando sincronizacion organization_id=%s date_from=%s date_to=%s inboxes=%s limit=%s read_scope=all",
        organization_id,
        date_from,
        date_to,
        inboxes.count(),
        limit,
    )
    if progress_key:
        _set_sync_progress(
            progress_key,
            status="running",
            organization_id=int(organization_id),
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
            limit=limit,
            year=SYNC_TARGET_YEAR,
            created=0,
            updated=0,
            processed_messages=0,
            scanned_messages=0,
            total_candidates=0,
            selected_candidates=0,
            skipped_non_invoice=0,
            skipped_out_of_range=0,
            has_more=False,
            truncated=False,
            errors=[],
            message="Iniciando sincronización",
            started_at=timezone.now().isoformat(),
            finished_at=None,
        )

    created = 0
    updated = 0
    processed_messages = 0
    scanned_messages = 0
    total_candidates = 0
    skipped_non_invoice = 0
    skipped_out_of_range = 0
    errors = []
    truncated = False
    has_more = False

    for inbox in inboxes:
        try:
            payloads, inbox_errors, inbox_skipped_out_of_range, inbox_skipped_non_invoice, inbox_total_candidates, inbox_scanned_messages = _fetch_email_invoice_payloads(
                inbox,
                date_from=date_from,
                date_to=date_to,
                max_messages=limit,
                progress_key=progress_key,
            )
            processed_messages += len(payloads)
            scanned_messages += inbox_scanned_messages
            total_candidates += inbox_total_candidates
            skipped_non_invoice += inbox_skipped_non_invoice
            skipped_out_of_range += inbox_skipped_out_of_range
            truncated = truncated or inbox_total_candidates > inbox_scanned_messages
            has_more = has_more or inbox_total_candidates > inbox_scanned_messages
            errors.extend(f"{inbox.email}: {error}" for error in inbox_errors)
            for payload in payloads:
                inbox_payload = _serialize_json_safe(
                    {
                        "items": payload["items"],
                        "inbox_email": inbox.email,
                        "pdf_filename": payload.get("pdf_filename", ""),
                        "pdf_base64": payload.get("pdf_base64", ""),
                        "document_type": payload.get("document_type", ""),
                    }
                )
                defaults = {
                    "supplier_name": payload["supplier_name"],
                    "supplier_tax_id": payload["supplier_tax_id"],
                    "buyer_name": payload["buyer_name"],
                    "buyer_tax_id": payload["buyer_tax_id"],
                    "issue_date": payload["issue_date"],
                    "invoice_number": payload["invoice_number"][:40],
                    "currency": payload["currency"],
                    "exchange_rate": payload["exchange_rate"],
                    "subtotal": payload["subtotal"],
                    "tax_total": payload["tax_total"],
                    "total": payload["total"],
                    "status": PurchaseInboxInvoice.STATUS_PENDING,
                    "source": "email",
                    "payload": inbox_payload,
                }
                invoice, was_created = PurchaseInboxInvoice.objects.get_or_create(
                    organization_id=organization_id,
                    numeric_key=payload["numeric_key"],
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                    if progress_key:
                        _set_sync_progress(progress_key, created=created, message=f"Factura nueva detectada: {payload['invoice_number'][:40]}")
                    continue

                if invoice.status == PurchaseInboxInvoice.STATUS_REGISTERED:
                    continue

                changed_fields = []
                for field, value in defaults.items():
                    if getattr(invoice, field) != value:
                        setattr(invoice, field, value)
                        changed_fields.append(field)
                if changed_fields:
                    invoice.save(update_fields=changed_fields)
                    updated += 1
                    if progress_key:
                        _set_sync_progress(progress_key, updated=updated, message=f"Factura actualizada: {payload['invoice_number'][:40]}")
            logger.info(
                "Sync parcial organization_id=%s inbox=%s created=%s updated=%s processed=%s skipped_non_invoice=%s skipped_out_of_range=%s errors=%s",
                organization_id,
                inbox.email,
                created,
                updated,
                len(payloads),
                inbox_skipped_non_invoice,
                inbox_skipped_out_of_range,
                len(inbox_errors),
            )
            if inbox_total_candidates > inbox_scanned_messages:
                logger.warning(
                    "Sync truncado organization_id=%s inbox=%s total_candidates=%s scanned_messages=%s max_messages=%s",
                    organization_id,
                    inbox.email,
                    inbox_total_candidates,
                    inbox_scanned_messages,
                    limit,
                )
        except Exception as exc:
            errors.append(f"{inbox.email}: {exc}")
            logger.exception("Error sincronizando inbox=%s organization_id=%s date_from=%s date_to=%s", inbox.email, organization_id, date_from, date_to)

    logger.info(
        "Sync final organization_id=%s date_from=%s date_to=%s created=%s updated=%s processed=%s scanned=%s candidates=%s skipped_non_invoice=%s skipped_out_of_range=%s errors=%s",
        organization_id,
        date_from,
        date_to,
        created,
        updated,
        processed_messages,
        scanned_messages,
        total_candidates,
        skipped_non_invoice,
        skipped_out_of_range,
        len(errors),
    )
    return {
        "created": created,
        "updated": updated,
        "processed_messages": processed_messages,
        "scanned_messages": scanned_messages,
        "total_candidates": total_candidates,
        "skipped_non_invoice": skipped_non_invoice,
        "skipped_out_of_range": skipped_out_of_range,
        "truncated": truncated,
        "has_more": has_more,
        "errors": errors,
    }


def _run_purchase_inbox_sync(progress_key, organization_id, date_from, date_to, limit):
    try:
        sync_result = _sync_email_invoices_for_organization(
            organization_id=organization_id,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            progress_key=progress_key,
        )
        pending = PurchaseInboxInvoice.objects.filter(organization_id=organization_id, status=PurchaseInboxInvoice.STATUS_PENDING).count()
        in_process = PurchaseInboxInvoice.objects.filter(organization_id=organization_id, status=PurchaseInboxInvoice.STATUS_IN_PROCESS).count()
        _set_sync_progress(
            progress_key,
            status="completed",
            pending=pending,
            in_process=in_process,
            finished_at=timezone.now().isoformat(),
            synced_at=timezone.now().isoformat(),
            message="Sincronización completada correctamente",
            **sync_result,
        )
    except Exception as exc:
        logger.exception("Error ejecutando trabajo de sincronizacion progress_key=%s", progress_key)
        _set_sync_progress(
            progress_key,
            status="error",
            finished_at=timezone.now().isoformat(),
            message="La sincronización terminó con error",
            errors=[str(exc)],
        )


def _escape_pdf_text(value):
    return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _add_text(content_ops, x, y, text, font="F1", size=10, color=(0, 0, 0)):
    content_ops.append(f"{color[0]} {color[1]} {color[2]} rg")
    content_ops.append(f"BT /{font} {size} Tf {x} {y} Td ({_escape_pdf_text(text)}) Tj ET")


def _add_rect(content_ops, x, y, width, height, fill=None, stroke=None, line_width=1):
    if fill is not None:
        content_ops.append(f"{fill[0]} {fill[1]} {fill[2]} rg")
        content_ops.append(f"{x} {y} {width} {height} re f")
    if stroke is not None:
        content_ops.append(f"{stroke[0]} {stroke[1]} {stroke[2]} RG")
        content_ops.append(f"{line_width} w")
        content_ops.append(f"{x} {y} {width} {height} re S")


def generate_invoice_pdf(invoice):
    blue = (0.11, 0.47, 0.78)
    light_blue = (0.93, 0.96, 1)
    gray = (0.35, 0.35, 0.35)
    dark_gray = (0.2, 0.2, 0.2)
    page_width = 612
    page_height = 792
    left_margin = 40
    right_margin = 40
    content_width = page_width - left_margin - right_margin
    content_ops = []

    # Encabezado
    _add_text(content_ops, left_margin, page_height - 58, "FACTURA ELECTRONICA", font="F2", size=18, color=blue)
    _add_text(content_ops, left_margin, page_height - 78, "360CR", font="F2", size=11, color=gray)
    _add_rect(content_ops, left_margin, page_height - 92, content_width, 1.4, fill=blue)

    header_box_w = 220
    header_box_h = 56
    header_box_x = page_width - right_margin - header_box_w
    header_box_y = page_height - 104
    _add_rect(content_ops, header_box_x, header_box_y, header_box_w, header_box_h, fill=light_blue, stroke=blue)
    _add_text(content_ops, header_box_x + 10, header_box_y + 38, f"N. FACTURA: {invoice.invoice_number}", font="F2", size=10, color=dark_gray)
    _add_text(content_ops, header_box_x + 10, header_box_y + 24, f"CONSECUTIVO: {invoice.consecutive_number}", size=9, color=gray)
    _add_text(content_ops, header_box_x + 10, header_box_y + 10, f"FECHA: {invoice.issue_date.strftime('%Y-%m-%d %H:%M')}", size=9, color=gray)

    # Bloques de información
    top_y = page_height - 220
    block_height = 105
    block_gap = 20
    block_width = (page_width - left_margin - right_margin - block_gap) / 2

    _add_rect(content_ops, left_margin, top_y, block_width, block_height, fill=light_blue, stroke=blue)
    _add_rect(content_ops, left_margin + block_width + block_gap, top_y, block_width, block_height, fill=light_blue, stroke=blue)
    _add_rect(content_ops, left_margin, top_y + block_height - 20, block_width, 20, fill=blue)
    _add_rect(content_ops, left_margin + block_width + block_gap, top_y + block_height - 20, block_width, 20, fill=blue)
    _add_text(content_ops, left_margin + 8, top_y + block_height - 14, "FACTURAR A", font="F2", size=10, color=(1, 1, 1))
    _add_text(content_ops, left_margin + block_width + block_gap + 8, top_y + block_height - 14, "DETALLE", font="F2", size=10, color=(1, 1, 1))

    _add_text(content_ops, left_margin + 8, top_y + block_height - 34, invoice.customer.legal_name[:52], font="F2", size=10, color=dark_gray)
    _add_text(content_ops, left_margin + 8, top_y + block_height - 52, f"ID: {invoice.customer.tax_id}", size=9, color=gray)
    _add_text(content_ops, left_margin + 8, top_y + block_height - 70, f"Correo: {invoice.customer.email or 'No registrado'}", size=9, color=gray)
    _add_text(content_ops, left_margin + 8, top_y + block_height - 88, f"Telefono: {invoice.customer.phone or 'No registrado'}", size=9, color=gray)

    _add_text(content_ops, left_margin + block_width + block_gap + 8, top_y + block_height - 34, f"Condicion venta: {invoice.sale_condition}", size=9, color=gray)
    _add_text(content_ops, left_margin + block_width + block_gap + 8, top_y + block_height - 52, f"Medio pago: {invoice.payment_method}", size=9, color=gray)
    _add_text(content_ops, left_margin + block_width + block_gap + 8, top_y + block_height - 70, f"Regimen fiscal: {invoice.tax_regime}", size=9, color=gray)
    if invoice.payment_method == Invoice.PAYMENT_INSTALLMENTS:
        installments = f"{invoice.installment_count} cuotas cada {invoice.installment_interval_days} dias"
        _add_text(content_ops, left_margin + block_width + block_gap + 8, top_y + block_height - 88, installments, size=9, color=gray)

    # Tabla de líneas
    table_top = top_y - 30
    row_height = 20
    items = list(invoice.items.all())
    item_count = len(items)
    max_rows = min(max(item_count + 2, 8), 16)
    table_width = page_width - left_margin - right_margin
    desc_width = table_width - 110

    _add_rect(content_ops, left_margin, table_top, table_width, row_height, fill=blue, stroke=blue)
    _add_text(content_ops, left_margin + 8, table_top + 6, "DESCRIPCION", font="F2", size=10, color=(1, 1, 1))
    _add_text(content_ops, left_margin + desc_width + 8, table_top + 6, "MONTO", font="F2", size=10, color=(1, 1, 1))

    y = table_top - row_height
    for idx in range(max_rows):
        _add_rect(content_ops, left_margin, y, table_width, row_height, stroke=(0.75, 0.85, 0.95), line_width=0.7)
        content_ops.append(f"{left_margin + desc_width} {y} m {left_margin + desc_width} {y + row_height} l S")
        if idx < len(items):
            item = items[idx]
            description = f"{item.line_number}. {item.description}"[:78]
            _add_text(content_ops, left_margin + 8, y + 6, description, size=9, color=gray)
            _add_text(content_ops, left_margin + desc_width + 8, y + 6, str(item.total), font="F2", size=9, color=dark_gray)
        y -= row_height

    # Totales
    totals_top = y - 8
    label_x = left_margin + desc_width
    value_x = label_x + 70
    totals = [("SUBTOTAL", invoice.subtotal), ("IMPUESTO", invoice.tax_total), ("TOTAL", invoice.total)]
    for idx, (label, value) in enumerate(totals):
        row_y = totals_top - (idx * 20)
        fill_color = light_blue if label != "TOTAL" else blue
        text_color = gray if label != "TOTAL" else (1, 1, 1)
        _add_rect(content_ops, label_x, row_y, table_width - desc_width, 20, fill=fill_color, stroke=(0.75, 0.85, 0.95))
        _add_text(content_ops, label_x + 8, row_y + 6, label, font="F2", size=10, color=text_color)
        _add_text(content_ops, value_x, row_y + 6, str(value), font="F2", size=10, color=text_color)

    footer_y = max(totals_top - 46, 54)
    _add_rect(content_ops, left_margin, footer_y + 20, content_width, 1.2, fill=blue)
    _add_text(content_ops, left_margin, footer_y, "Gracias por su compra.", font="F2", size=13, color=blue)
    _add_text(content_ops, left_margin, footer_y - 14, "Si tiene consultas sobre esta factura, contactenos por nuestros canales oficiales.", size=9, color=gray)

    stream = "\n".join(content_ops).encode("latin-1", errors="replace")

    objects = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
    objects.append(
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >> endobj\n"
    )
    objects.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    objects.append(b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n")
    objects.append(f"6 0 obj << /Length {len(stream)} >> stream\n".encode() + stream + b"\nendstream endobj\n")

    pdf = b"%PDF-1.4\n"
    offsets = []
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj
    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects)+1}\n".encode()
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010} 00000 n \n".encode()
    pdf += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode()
    return pdf


class ProductViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Product.objects.all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()


class InvoiceViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Invoice.objects.select_related("customer", "organization").prefetch_related(
            "items",
            "items__product",
            "receivable_payments",
            "receivable_payments__created_by",
        )
        return self.scope_queryset(queryset)

    def create(self, request, *args, **kwargs):
        serializer = InvoiceCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="customer-autocomplete")
    def customer_autocomplete(self, request):
        term = request.query_params.get("q", "").strip()
        organization_id = request.query_params.get("organization_id")
        if not organization_id:
            return Response({"detail": "organization_id es requerido"}, status=400)
        try:
            organization_id_int = int(organization_id)
        except (TypeError, ValueError):
            return Response({"detail": "organization_id inválido"}, status=400)
        self.validate_organization_payload(organization_id_int)

        queryset = Customer.objects.filter(organization_id=organization_id_int, status=Customer.STATUS_ACTIVE)
        if term:
            queryset = queryset.filter(legal_name__icontains=term) | queryset.filter(tax_id__icontains=term)

        customers = list(queryset[:10])
        customer_ids = [customer.id for customer in customers]
        members = (
            LoyaltyMember.objects.select_related("program")
            .filter(
                customer_id__in=customer_ids,
                program__organization_id=organization_id_int,
                status=LoyaltyMember.STATUS_ACTIVE,
                program__is_active=True,
            )
            .order_by("id")
        )
        members_by_customer = {}
        for member in members:
            members_by_customer.setdefault(member.customer_id, member)

        data = []
        for customer in customers:
            member = members_by_customer.get(customer.id)
            data.append(
                {
                    "id": customer.id,
                    "legal_name": customer.legal_name,
                    "tax_id": customer.tax_id,
                    "email": customer.email,
                    "phone": customer.phone,
                    "loyalty": (
                        {
                            "member_id": member.id,
                            "program_name": member.program.name,
                            "available_points": member.available_points,
                        }
                        if member
                        else None
                    ),
                }
            )
        return Response(data)

    @action(detail=False, methods=["get"], url_path="accounts-receivable")
    def accounts_receivable(self, request):
        queryset = (
            self.get_queryset()
            .filter(payment_method=Invoice.PAYMENT_INSTALLMENTS, sale_condition="02")
            .order_by("-issue_date", "-id")
        )
        status_filter = (request.query_params.get("status") or "").strip().lower()
        search = (request.query_params.get("q") or "").strip().lower()
        invoices = list(queryset)
        serialized = InvoiceSerializer(invoices, many=True).data

        if search:
            serialized = [
                invoice
                for invoice in serialized
                if search in f"{invoice.get('invoice_number', '')} {invoice.get('customer_name', '')} {invoice.get('notes', '')}".lower()
            ]

        if status_filter:
            serialized = [invoice for invoice in serialized if (invoice.get("receivable_status") or "") == status_filter]

        return Response(serialized)

    @action(detail=True, methods=["post"], url_path="receivable-payments")
    def receivable_payments(self, request, pk=None):
        invoice = self.get_object()
        serializer = InvoiceReceivablePaymentCreateSerializer(data=request.data, context={"request": request, "invoice": invoice})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        invoice.refresh_from_db()
        refreshed = (
            Invoice.objects.select_related("customer", "organization")
            .prefetch_related("items", "items__product", "receivable_payments", "receivable_payments__created_by")
            .get(id=invoice.id)
        )
        return Response(InvoiceSerializer(refreshed).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"receivable-payments/(?P<payment_id>[^/.]+)")
    def delete_receivable_payment(self, request, pk=None, payment_id=None):
        invoice = self.get_object()
        payment = invoice.receivable_payments.filter(id=payment_id).first()
        if not payment:
            return Response({"detail": "El abono indicado no existe para esta factura."}, status=404)
        payment.delete()
        refreshed = (
            Invoice.objects.select_related("customer", "organization")
            .prefetch_related("items", "items__product", "receivable_payments", "receivable_payments__created_by")
            .get(id=invoice.id)
        )
        return Response(InvoiceSerializer(refreshed).data)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        pdf = generate_invoice_pdf(invoice)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="factura-{invoice.invoice_number}.pdf"'
        return response

    @action(detail=True, methods=["post"], url_path="send-email")
    def send_email_action(self, request, pk=None):
        invoice = self.get_object()
        if not invoice.customer.email:
            return Response({"detail": "El cliente no tiene correo registrado."}, status=400)

        send_mail(
            subject=f"Factura electrónica {invoice.invoice_number}",
            message=f"Factura {invoice.invoice_number}. Total: {invoice.total}",
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "facturacion@360cr.local"),
            recipient_list=[invoice.customer.email],
            fail_silently=False,
        )
        invoice.email_sent_at = timezone.now()
        invoice.save(update_fields=["email_sent_at"])
        return Response({"detail": "Correo enviado."})


class PurchaseViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Purchase.objects.prefetch_related("items")
        return self.scope_queryset(queryset)

    def get_serializer_class(self):
        if self.action == "create":
            return PurchaseCreateSerializer
        return PurchaseSerializer

    def create(self, request, *args, **kwargs):
        serializer = PurchaseCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        purchase = serializer.save()
        return Response(PurchaseSerializer(purchase).data, status=status.HTTP_201_CREATED)


class PurchaseInboxViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PurchaseInboxSerializer

    def get_queryset(self):
        queryset = PurchaseInboxInvoice.objects.select_related("purchase")
        queryset = self.scope_queryset(queryset)
        bucket = self.request.query_params.get("bucket", "inbox")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        elif bucket == "history":
            queryset = queryset.filter(
                status__in=[
                    PurchaseInboxInvoice.STATUS_REGISTERED,
                    PurchaseInboxInvoice.STATUS_REJECTED,
                ]
            )
        elif bucket == "inbox":
            queryset = queryset.filter(
                status__in=[
                    PurchaseInboxInvoice.STATUS_PENDING,
                    PurchaseInboxInvoice.STATUS_IN_PROCESS,
                ]
            )
        return queryset

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        organization_id = request.data.get("organization") or request.query_params.get("organization_id")
        organization_id = self.validate_organization_payload(organization_id)
        default_date_from = datetime(SYNC_TARGET_YEAR, 1, 1).date()
        default_date_to = datetime(SYNC_TARGET_YEAR, 12, 31).date()
        date_from_raw = request.data.get("date_from") or request.query_params.get("date_from") or default_date_from.isoformat()
        date_to_raw = request.data.get("date_to") or request.query_params.get("date_to") or default_date_to.isoformat()
        limit = request.data.get("limit") or request.query_params.get("limit") or SYNC_MAX_MESSAGES
        try:
            date_from = _parse_sync_date(date_from_raw, default_date_from)
            date_to = _parse_sync_date(date_to_raw, default_date_to)
        except (TypeError, ValueError):
            return Response({"detail": "Los parametros de fecha son invalidos. Usa YYYY-MM-DD."}, status=400)
        try:
            limit = max(1, min(int(limit), SYNC_MAX_BATCH_SIZE))
        except (TypeError, ValueError):
            return Response({"detail": "El parametro limit es invalido."}, status=400)
        if date_from > date_to:
            return Response({"detail": "La fecha inicial no puede ser mayor a la fecha final."}, status=400)
        if date_from.year != SYNC_TARGET_YEAR or date_to.year != SYNC_TARGET_YEAR:
            return Response({"detail": f"Solo se permite sincronizar fechas del {SYNC_TARGET_YEAR}."}, status=400)
        progress_key = _build_sync_progress_key(organization_id, date_from, date_to, limit)
        current_progress = _get_sync_progress(progress_key)
        if current_progress and current_progress.get("status") == "running":
            return Response(current_progress, status=status.HTTP_202_ACCEPTED)

        _set_sync_progress(
            progress_key,
            status="queued",
            organization_id=organization_id,
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
            limit=limit,
            year=SYNC_TARGET_YEAR,
            created=0,
            updated=0,
            processed_messages=0,
            scanned_messages=0,
            total_candidates=0,
            selected_candidates=0,
            skipped_non_invoice=0,
            skipped_out_of_range=0,
            has_more=False,
            truncated=False,
            read_status_scope="all",
            rules={
                "requires_xml": True,
                "requires_pdf_or_invoice_keywords": True,
                "reads_seen_and_unseen": True,
                "allowed_xml_issue_year": SYNC_TARGET_YEAR,
            },
            errors=[],
            message="Sincronización en cola",
            started_at=timezone.now().isoformat(),
            finished_at=None,
        )
        worker = threading.Thread(
            target=_run_purchase_inbox_sync,
            args=(progress_key, organization_id, date_from, date_to, limit),
            daemon=True,
        )
        worker.start()
        return Response(_get_sync_progress(progress_key), status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=["get"], url_path="sync-status")
    def sync_status(self, request):
        organization_id = request.query_params.get("organization_id")
        organization_id = self.validate_organization_payload(organization_id)
        default_date_from = datetime(SYNC_TARGET_YEAR, 1, 1).date()
        default_date_to = datetime(SYNC_TARGET_YEAR, 12, 31).date()
        date_from = _parse_sync_date(request.query_params.get("date_from"), default_date_from)
        date_to = _parse_sync_date(request.query_params.get("date_to"), default_date_to)
        limit = max(1, min(int(request.query_params.get("limit") or SYNC_MAX_MESSAGES), SYNC_MAX_BATCH_SIZE))
        progress_key = _build_sync_progress_key(organization_id, date_from, date_to, limit)
        progress = _get_sync_progress(progress_key)
        if not progress:
            return Response(
                {
                    "status": "idle",
                    "organization_id": organization_id,
                    "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(),
                    "limit": limit,
                    "year": SYNC_TARGET_YEAR,
                    "message": "No hay una sincronización activa para este rango.",
                }
            )
        return Response(progress)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        inbox = self.get_object()
        if inbox.status == PurchaseInboxInvoice.STATUS_REGISTERED:
            return Response({"detail": "La factura ya fue registrada."}, status=400)
        if inbox.status == PurchaseInboxInvoice.STATUS_REJECTED:
            return Response({"detail": "La factura fue rechazada y ya está en el histórico."}, status=400)

        payload = {
            "organization": inbox.organization_id,
            "supplier_name": inbox.supplier_name,
            "supplier_tax_id": inbox.supplier_tax_id,
            "buyer_name": inbox.buyer_name or "",
            "buyer_tax_id": inbox.buyer_tax_id or "",
            "issue_date": inbox.issue_date,
            "invoice_number": inbox.invoice_number,
            "numeric_key": inbox.numeric_key,
            "currency": inbox.currency,
            "exchange_rate": inbox.exchange_rate,
            "tax_total": inbox.tax_total,
            "source": "inbox",
            "items": inbox.payload.get("items") or [{"description": "Factura electrónica", "unit_price": inbox.subtotal, "quantity": "1.000"}],
        }
        serializer = PurchaseCreateSerializer(data=payload, context={"request": request})
        serializer.is_valid(raise_exception=True)
        purchase = serializer.save()
        inbox.status = PurchaseInboxInvoice.STATUS_REGISTERED
        inbox.purchase = purchase
        inbox.processed_at = timezone.now()
        inbox.rejection_reason = ""
        inbox.save(update_fields=["status", "purchase", "processed_at", "rejection_reason"])
        return Response(PurchaseInboxSerializer(inbox).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        inbox = self.get_object()
        if inbox.status == PurchaseInboxInvoice.STATUS_REGISTERED:
            return Response({"detail": "La factura ya fue aprobada y movida al histórico."}, status=400)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "Debe indicar el motivo del rechazo."}, status=400)
        inbox.status = PurchaseInboxInvoice.STATUS_REJECTED
        inbox.rejection_reason = reason
        inbox.processed_at = timezone.now()
        inbox.save(update_fields=["status", "rejection_reason", "processed_at"])
        return Response(PurchaseInboxSerializer(inbox).data)


class TaxQuarterReportViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TaxReportSerializer

    def get_queryset(self):
        queryset = TaxReport.objects.all()
        return self.scope_queryset(queryset)

    def create(self, request, *args, **kwargs):
        organization_id = request.data.get("organization")
        self.validate_organization_payload(organization_id)

        year = int(request.data.get("year"))
        quarter = int(request.data.get("quarter"))
        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2

        purchases = Purchase.objects.filter(
            organization_id=organization_id,
            issue_date__year=year,
            issue_date__month__gte=start_month,
            issue_date__month__lte=end_month,
        )
        subtotal = sum((p.subtotal for p in purchases), start=Decimal("0.00"))
        taxes = sum((p.tax_total for p in purchases), start=Decimal("0.00"))
        total = sum((p.total for p in purchases), start=Decimal("0.00"))

        rts_factor = Decimal(str(request.data.get("rts_factor")))
        estimated_tax = (subtotal * rts_factor).quantize(Decimal("0.01"))
        due_month = end_month + 1 if end_month < 12 else 1
        due_year = year if due_month != 1 else year + 1

        report = TaxReport.objects.create(
            organization_id=organization_id,
            year=year,
            quarter=quarter,
            economic_activity=request.data.get("economic_activity"),
            rts_factor=rts_factor,
            purchases_subtotal=subtotal,
            purchases_tax=taxes,
            purchases_total=total,
            estimated_tax=estimated_tax,
            due_date=timezone.datetime(due_year, due_month, 15).date(),
            declaration_form="D-105",
        )
        return Response(TaxReportSerializer(report).data, status=status.HTTP_201_CREATED)
