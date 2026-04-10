from django.conf import settings
from django.core.mail import send_mail
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.customers.models import Customer
from apps.finance.models import Invoice, Product, Purchase, TaxQuarterReport
from apps.finance.serializers import (
    InvoiceCreateSerializer,
    InvoiceSerializer,
    ProductSerializer,
    PurchaseCreateSerializer,
    PurchaseSerializer,
    TaxQuarterReportCalculateSerializer,
    TaxQuarterReportSerializer,
)
from apps.loyalty.models import LoyaltyMember
from apps.tenants.access import OrganizationScopedViewMixin


def _escape_pdf_text(value):
    return str(value).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def generate_simple_pdf(lines):
    content_ops = ["BT /F1 11 Tf 40 760 Td"]
    for idx, line in enumerate(lines):
        if idx == 0:
            content_ops.append(f"({_escape_pdf_text(line)}) Tj")
        else:
            content_ops.append("0 -14 Td")
            content_ops.append(f"({_escape_pdf_text(line)}) Tj")
    content_ops.append("ET")
    stream = "\n".join(content_ops).encode("latin-1", errors="replace")

    objects = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
    objects.append(b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n")
    objects.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    objects.append(f"5 0 obj << /Length {len(stream)} >> stream\n".encode() + stream + b"\nendstream endobj\n")

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
        lines = [
            f"Factura: {invoice.invoice_number}",
            f"Consecutivo: {invoice.consecutive_number}",
            f"Cliente: {invoice.customer.legal_name} ({invoice.customer.tax_id})",
            f"Fecha: {invoice.issue_date.strftime('%Y-%m-%d %H:%M')}",
            f"Condicion venta: {invoice.sale_condition} | Medio pago: {invoice.payment_method}",
            f"Regimen fiscal: {invoice.tax_regime}",
        ]
        if invoice.payment_method == Invoice.PAYMENT_INSTALLMENTS:
            lines.append(f"Pago a plazos: {invoice.installment_count} cuotas cada {invoice.installment_interval_days} días")
        lines.extend([f"{i.line_number}. {i.description} x {i.quantity} = {i.total}" for i in invoice.items.all()])
        lines.extend([f"Subtotal: {invoice.subtotal}", f"Impuesto: {invoice.tax_total}", f"Total: {invoice.total}"])
        pdf = generate_simple_pdf(lines)
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
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Purchase.objects.prefetch_related("items")
        return self.scope_queryset(queryset)

    def create(self, request, *args, **kwargs):
        serializer = PurchaseCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        purchase = serializer.save()
        return Response(PurchaseSerializer(purchase).data, status=status.HTTP_201_CREATED)


class TaxQuarterReportViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = TaxQuarterReportSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = TaxQuarterReport.objects.all()
        return self.scope_queryset(queryset)

    def create(self, request, *args, **kwargs):
        serializer = TaxQuarterReportCalculateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        return Response(TaxQuarterReportSerializer(report).data, status=status.HTTP_201_CREATED)
