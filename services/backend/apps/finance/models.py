from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.customers.models import Customer
from apps.suppliers.models import Supplier
from apps.tenants.models import Organization


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["organization", "sku"], name="uq_product_org_sku")]


class Invoice(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_ISSUED = "issued"
    STATUS_VOID = "void"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Borrador"),
        (STATUS_ISSUED, "Emitida"),
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
    PAYMENT_INSTALLMENTS = "04"
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH, "Efectivo"),
        (PAYMENT_CARD, "Tarjeta"),
        (PAYMENT_TRANSFER, "Transferencia"),
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
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-id"]
        constraints = [models.UniqueConstraint(fields=["organization", "invoice_number"], name="uq_invoice_org_number")]


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
