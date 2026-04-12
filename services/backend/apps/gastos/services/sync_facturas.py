from django.utils import timezone
from django.shortcuts import redirect

from apps.gastos.models import ConfigCorreoFactura, FacturaGasto
from apps.gastos.services import (
    IMAPClient,
    parse_email,
    extract_xml_pdf,
    parse_factura_xml,
    crear_factura_desde_correo,
    existe_por_message_id,
)
from apps.gastos.services.gastos_fijos import aplicar_gasto_fijo_a_factura


def sync_facturas(*, year=None, solo_unread=True):
    """
    Sincroniza facturas desde correo.

    Args:
        year (int | None): año a sincronizar
        solo_unread (bool): solo correos no leídos

    Returns:
        list[dict]: resultados por negocio
    """

    resultados = []

    configs = ConfigCorreoFactura.objects.filter(activo=True)

    for cfg in configs:
        creadas = 0
        omitidas = 0

        client = IMAPClient(cfg.imap_host, cfg.imap_port, cfg.imap_ssl)

        try:
            client.connect(cfg.username, cfg.password)
            client.select_folder(cfg.carpeta)

            if year:
                ids = client.search_by_year(
                    year=year,
                    subject="factura",
                    unseen_only=solo_unread,
                )
            else:
                ids = client.search_unseen()

            for msg_id in ids:
                raw = client.fetch_rfc822(msg_id)
                msg, meta = parse_email(raw)

                message_id = meta.get("message_id", "")

                if existe_por_message_id(cfg.negocio_id, message_id):
                    omitidas += 1
                    continue

                xml_bytes, pdf_bytes, xml_name, pdf_name = extract_xml_pdf(msg)

                if not xml_bytes:
                    continue

                factura_data = parse_factura_xml(xml_bytes)

                if not factura_data.get("fecha_emision"):
                    continue

                crear_factura_desde_correo(
                    negocio=cfg.negocio,
                    usuario=None,
                    meta=meta,
                    factura_data=factura_data,
                    xml_bytes=xml_bytes,
                    xml_name=xml_name or "factura.xml",
                    pdf_bytes=pdf_bytes,
                    pdf_name=pdf_name or "factura.pdf",
                )

                client.mark_seen(msg_id)
                creadas += 1

            cfg.ultima_sync = timezone.now()
            cfg.save(update_fields=["ultima_sync"])

        finally:
            client.logout()

        resultados.append(
            {
                "negocio": cfg.negocio_id,
                "creadas": creadas,
                "omitidas": omitidas,
            }
        )

    return resultados


def aplicar_reglas_gastos_fijos(request):
    """Aplica reglas de gastos fijos sobre facturas pendientes del negocio activo."""
    negocio_id = request.session.get("negocio_activo_id")
    if not negocio_id:
        return redirect("gastos:bandeja_facturas")

    facturas = FacturaGasto.objects.filter(
        negocio_id=negocio_id,
        estado__in=["pendiente", "en_registro"],
    ).select_related("categoria")

    for factura in facturas:
        aplicar_gasto_fijo_a_factura(factura)

    return redirect("gastos:bandeja_facturas")
