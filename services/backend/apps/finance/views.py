from django.conf import settings
from django.core.mail import send_mail
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.customers.models import Customer
from apps.finance.models import Invoice, Product
from apps.finance.serializers import InvoiceCreateSerializer, InvoiceSerializer, ProductSerializer, PurchaseCreateSerializer
from apps.loyalty.models import LoyaltyMember
from apps.tenants.access import OrganizationScopedViewMixin


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
        queryset = Invoice.objects.select_related("customer", "organization").prefetch_related("items", "items__product")
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


class PurchaseViewSet(OrganizationScopedViewMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def create(self, request):
        serializer = PurchaseCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class TaxQuarterReportViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        return Response({"detail": "Reporte trimestral no implementado en esta versión."}, status=status.HTTP_501_NOT_IMPLEMENTED)
