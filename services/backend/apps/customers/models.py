from django.db import models
from apps.tenants.models import Organization


class CustomerType(models.Model):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=80, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Customer(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_INACTIVE = "inactive"
    STATUS_BLOCKED = "blocked"

    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Activo"),
        (STATUS_INACTIVE, "Inactivo"),
        (STATUS_BLOCKED, "Bloqueado"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    customer_type = models.ForeignKey(CustomerType, on_delete=models.PROTECT)
    code = models.CharField(max_length=30)
    legal_name = models.CharField(max_length=200)
    trade_name = models.CharField(max_length=200, blank=True)
    tax_id = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    tax_regime_code = models.CharField(max_length=20, blank=True)
    tax_regime_description = models.CharField(max_length=160, blank=True)
    tax_status = models.CharField(max_length=80, blank=True)
    tax_administration = models.CharField(max_length=120, blank=True)
    tax_is_delinquent = models.BooleanField(null=True, blank=True)
    tax_is_omitted = models.BooleanField(null=True, blank=True)
    tax_activities = models.JSONField(default=list, blank=True)
    tax_last_sync_at = models.DateTimeField(null=True, blank=True)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_terms_days = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["legal_name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="uq_customer_org_code"),
            models.UniqueConstraint(fields=["organization", "tax_id"], condition=~models.Q(tax_id=""), name="uq_customer_org_tax_id"),
        ]

    def __str__(self) -> str:
        return f"{self.organization_id} - {self.legal_name}"


class CustomerContact(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="contacts")
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer"],
                condition=models.Q(is_primary=True),
                name="uq_primary_contact_per_customer",
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer_id} - {self.first_name} {self.last_name}".strip()


class CustomerAddress(models.Model):
    TYPE_BILLING = "billing"
    TYPE_SHIPPING = "shipping"
    TYPE_OTHER = "other"

    TYPE_CHOICES = [
        (TYPE_BILLING, "Facturación"),
        (TYPE_SHIPPING, "Envío"),
        (TYPE_OTHER, "Otro"),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    address_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_BILLING)
    country = models.CharField(max_length=80)
    state = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80)
    postal_code = models.CharField(max_length=20, blank=True)
    address_line_1 = models.CharField(max_length=180)
    address_line_2 = models.CharField(max_length=180, blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "address_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer"],
                condition=models.Q(is_primary=True),
                name="uq_primary_address_per_customer",
            )
        ]

    def __str__(self) -> str:
        return f"{self.customer_id} - {self.city}"
