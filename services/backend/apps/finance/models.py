import uuid
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.customers.models import Customer
from apps.suppliers.models import Supplier
from apps.tenants.models import Organization

SHIPMENT_OWN_COURIER = "own_courier"
SHIPMENT_CORREOS_CR = "correos_cr"


def purchase_inbox_attachment_upload_to(instance, filename):
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    safe_extension = extension[:12] or "bin"
    return f"purchase-inbox/{instance.inbox_invoice.organization_id}/{uuid.uuid4()}.{safe_extension}"


class Category(models.Model):
    TYPE_INCOME = "income"
    TYPE_EXPENSE = "expense"
    TYPE_CHOICES = [
        (TYPE_INCOME, "Income"),
        (TYPE_EXPENSE, "Expense"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    class Meta:
        unique_together = ("organization", "name", "type")

    def __str__(self) -> str:
        return f"{self.name} ({self.type})"


class Transaction(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.organization.slug}: {self.description} - {self.amount}"


class Product(models.Model):
    TYPE_PHYSICAL = "physical"
    TYPE_SERVICE = "service"
    TYPE_CHOICES = [
        (TYPE_PHYSICAL, "Producto"),
        (TYPE_SERVICE, "Servicio"),
    ]
    STATUS_OK = "ok"
    STATUS_DAMAGED = "damaged"
    STATUS_RAW_MATERIAL = "raw_material"
    STATUS_CHOICES = [
        (STATUS_OK, "Buen estado"),
        (STATUS_DAMAGED, "Dañado"),
        (STATUS_RAW_MATERIAL, "Materia prima"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    sku = models.CharField(max_length=40)
    product_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_PHYSICAL)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    physical_location = models.CharField(max_length=120, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.01"), validators=[MinValueValidator(Decimal("0.01"))])
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("13.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    stock = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=0)
    item_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OK)
    is_active = models.BooleanField(default=True)
    service_duration_minutes = models.PositiveIntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["organization", "sku"], name="uq_product_org_sku")]


class Invoice(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_ISSUED = "issued"
    STATUS_SENT = "sent"
    STATUS_PAID = "paid"
    STATUS_OVERDUE = "overdue"
    STATUS_VOID = "void"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Borrador"),
        (STATUS_ISSUED, "Emitida"),
        (STATUS_SENT, "Enviada"),
        (STATUS_PAID, "Pagada"),
        (STATUS_OVERDUE, "Vencida"),
        (STATUS_VOID, "Anulada"),
    ]

    DOCUMENT_INVOICE = "01"
    DOCUMENT_CREDIT_NOTE = "03"
    DOCUMENT_CHOICES = [
        (DOCUMENT_INVOICE, "Factura electrónica"),
        (DOCUMENT_CREDIT_NOTE, "Nota de crédito"),
    ]

    REGIME_SIMPLIFIED = "simplified"
    REGIME_GENERAL = "general"
    TAX_REGIME_CHOICES = [
        (REGIME_SIMPLIFIED, "Régimen simplificado"),
        (REGIME_GENERAL, "Régimen general"),
    ]

    PAYMENT_CASH = "01"
    PAYMENT_CARD = "02"
    PAYMENT_TRANSFER = "03"
    PAYMENT_SINPE_MOVIL = "04"
    PAYMENT_INSTALLMENTS = "05"
    SHIPMENT_OWN_COURIER = "own_courier"
    SHIPMENT_CORREOS_CR = "correos_cr"
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH, "Efectivo"),
        (PAYMENT_CARD, "Tarjeta"),
        (PAYMENT_TRANSFER, "Transferencia"),
        (PAYMENT_SINPE_MOVIL, "SINPE Móvil"),
        (PAYMENT_INSTALLMENTS, "A plazos"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT)
    invoice_number = models.CharField(max_length=50)
    document_type = models.CharField(max_length=2, choices=DOCUMENT_CHOICES, default=DOCUMENT_INVOICE)
    consecutive_number = models.CharField(max_length=20)
    sale_condition = models.CharField(max_length=2, default="01")
    payment_method = models.CharField(max_length=2, choices=PAYMENT_METHOD_CHOICES, default=PAYMENT_CASH)
    tax_regime = models.CharField(max_length=20, choices=TAX_REGIME_CHOICES, default=REGIME_SIMPLIFIED)
    installment_count = models.PositiveSmallIntegerField(default=1)
    installment_interval_days = models.PositiveSmallIntegerField(default=30)
    issue_date = models.DateTimeField(auto_now_add=True)
    currency = models.CharField(max_length=3, default="CRC")
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("1.0000"))
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    email_sent_at = models.DateTimeField(null=True, blank=True)
    shipment_required = models.BooleanField(default=False)
    shipment_details = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    original_invoice = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="credit_notes")
    void_reason = models.TextField(blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="voided_invoices")

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.UniqueConstraint(fields=["invoice_number"], name="uq_invoice_number"),
            models.UniqueConstraint(fields=["consecutive_number"], name="uq_invoice_consecutive_number"),
        ]


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    line_number = models.PositiveIntegerField(default=1)
    description = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    discount_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("13.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["line_number"]

    def __str__(self) -> str:
        return f"{self.invoice_id} - {self.line_number}"


class InvoiceAuditLog(models.Model):
    ACTION_VOID = "void"
    ACTION_CREDIT_NOTE = "credit_note"
    ACTION_EMAIL_SENT = "email_sent"
    ACTION_PAYMENT = "payment"
    ACTION_CHOICES = [
        (ACTION_VOID, "Anulacion"),
        (ACTION_CREDIT_NOTE, "Nota de credito"),
        (ACTION_EMAIL_SENT, "Correo enviado"),
        (ACTION_PAYMENT, "Pago registrado"),
    ]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="audit_logs")
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class InvoiceReceivablePayment(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="receivable_payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    payment_date = models.DateField()
    reference = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-payment_date", "-id"]

    def __str__(self) -> str:
        return f"{self.invoice.invoice_number} - {self.amount}"


class Purchase(models.Model):
    SHIPMENT_METHOD_CHOICES = [
        (SHIPMENT_OWN_COURIER, "MensajerÃ­a propia"),
        (SHIPMENT_CORREOS_CR, "Correos de Costa Rica"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    supplier_name = models.CharField(max_length=200)
    supplier_tax_id = models.CharField(max_length=50)
    buyer_name = models.CharField(max_length=200)
    buyer_tax_id = models.CharField(max_length=50)
    issue_date = models.DateField()
    invoice_number = models.CharField(max_length=40)
    numeric_key = models.CharField(max_length=50)
    currency = models.CharField(max_length=3, default="CRC")
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("1.0000"))
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    source = models.CharField(max_length=20, default="manual")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-issue_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "numeric_key"],
                name="uq_purchase_org_numeric_key",
            )
        ]


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    line_number = models.PositiveIntegerField(default=1)
    description = models.CharField(max_length=220)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("1.000"), validators=[MinValueValidator(Decimal("0.001"))])
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        ordering = ["line_number"]


class TaxQuarterReport(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    year = models.PositiveIntegerField()
    quarter = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(4)])
    economic_activity = models.CharField(max_length=120)
    rts_factor = models.DecimalField(max_digits=8, decimal_places=4, validators=[MinValueValidator(Decimal("0.0001"))])
    purchases_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    estimated_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    due_date = models.DateField()
    declaration_form = models.CharField(max_length=20, default="D-105")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "-quarter", "-id"]
        constraints = [models.UniqueConstraint(fields=["organization", "year", "quarter"], name="uq_tax_quarter_org")]


class PurchaseInboxInvoice(models.Model):
    STATUS_PENDING = "pending"
    STATUS_IN_PROCESS = "in_process"
    STATUS_REGISTERED = "registered"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendiente"),
        (STATUS_IN_PROCESS, "En registro"),
        (STATUS_REGISTERED, "Registrada"),
        (STATUS_REJECTED, "Rechazada"),
    ]
    ACTIVE_STATUSES = {STATUS_PENDING, STATUS_IN_PROCESS}
    FINAL_STATUSES = {STATUS_REGISTERED, STATUS_REJECTED}

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="purchase_inbox")
    supplier_name = models.CharField(max_length=200)
    supplier_tax_id = models.CharField(max_length=50)
    buyer_name = models.CharField(max_length=200, blank=True)
    buyer_tax_id = models.CharField(max_length=50, blank=True)
    issue_date = models.DateField()
    invoice_number = models.CharField(max_length=40)
    numeric_key = models.CharField(max_length=50)
    currency = models.CharField(max_length=3, default="CRC")
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("1.0000"))
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    source = models.CharField(max_length=20, default="email")
    payload = models.JSONField(default=dict, blank=True)
    purchase = models.OneToOneField(Purchase, on_delete=models.SET_NULL, null=True, blank=True, related_name="inbox_invoice")
    rejection_reason = models.TextField(blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-issue_date", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "numeric_key"],
                name="uq_purchase_inbox_org_numeric_key",
            )
        ]

    def ensure_can_register(self):
        if self.status == self.STATUS_REGISTERED:
            raise ValidationError("La factura ya fue registrada.")
        if self.status == self.STATUS_REJECTED:
            raise ValidationError("La factura fue rechazada y ya esta en el historico.")
        if self.status not in self.ACTIVE_STATUSES:
            raise ValidationError("La factura no esta en un estado valido para registrarse.")

    def ensure_can_reject(self):
        if self.status == self.STATUS_REGISTERED:
            raise ValidationError("La factura ya fue aprobada y movida al historico.")
        if self.status == self.STATUS_REJECTED:
            raise ValidationError("La factura ya fue rechazada.")
        if self.status not in self.ACTIVE_STATUSES:
            raise ValidationError("La factura no esta en un estado valido para rechazarse.")

    def mark_registered(self, purchase, processed_at=None):
        if not purchase:
            raise ValidationError("Debe asociar una compra para registrar la factura.")
        self.ensure_can_register()
        self.status = self.STATUS_REGISTERED
        self.purchase = purchase
        self.processed_at = processed_at or timezone.now()
        self.rejection_reason = ""

    def mark_rejected(self, reason, processed_at=None):
        clean_reason = str(reason or "").strip()
        if not clean_reason:
            raise ValidationError("Debe indicar el motivo del rechazo.")
        self.ensure_can_reject()
        self.status = self.STATUS_REJECTED
        self.rejection_reason = clean_reason
        self.processed_at = processed_at or timezone.now()


class PurchaseInboxAttachment(models.Model):
    TYPE_PDF = "pdf"
    TYPE_CHOICES = [
        (TYPE_PDF, "PDF"),
    ]

    inbox_invoice = models.ForeignKey(PurchaseInboxInvoice, on_delete=models.CASCADE, related_name="attachments")
    attachment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_PDF)
    original_filename = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to=purchase_inbox_attachment_upload_to)
    content_type = models.CharField(max_length=120, blank=True, default="application/pdf")
    size_bytes = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    @classmethod
    def default_expires_at(cls):
        return timezone.now() + timedelta(days=getattr(settings, "PURCHASE_INBOX_ATTACHMENT_RETENTION_DAYS", 90))

    @classmethod
    def cleanup_expired(cls):
        deleted_count = 0
        for attachment in cls.objects.filter(expires_at__lt=timezone.now()).iterator():
            if attachment.file:
                attachment.file.delete(save=False)
            attachment.delete()
            deleted_count += 1
        return deleted_count


class TaxReport(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    year = models.PositiveIntegerField()
    quarter = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(4)])
    economic_activity = models.CharField(max_length=120)
    rts_factor = models.DecimalField(max_digits=8, decimal_places=4, validators=[MinValueValidator(Decimal("0.0001"))])
    purchases_subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    purchases_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    purchases_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    estimated_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    due_date = models.DateField()
    declaration_form = models.CharField(max_length=20, default="D-105")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-year", "-quarter", "-id"]
