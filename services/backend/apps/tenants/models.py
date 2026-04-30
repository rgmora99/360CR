from django.conf import settings
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


class Organization(models.Model):
    DIGITS_3 = RegexValidator(r"^\d{3}$", "Debe contener exactamente 3 dígitos.")
    DIGITS_5 = RegexValidator(r"^\d{5}$", "Debe contener exactamente 5 dígitos.")

    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    parent_organization = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="child_organizations")
    hacienda_branch_code = models.CharField(max_length=3, default="001", validators=[DIGITS_3])
    hacienda_terminal_code = models.CharField(max_length=5, default="00001", validators=[DIGITS_5])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["hacienda_branch_code", "hacienda_terminal_code"],
                name="uq_org_hacienda_branch_terminal",
            )
        ]

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    ROLE_OWNER = "owner"
    ROLE_ADMIN = "admin"
    ROLE_VIEWER = "viewer"

    ROLE_CHOICES = [
        (ROLE_OWNER, "Owner"),
        (ROLE_ADMIN, "Admin"),
        (ROLE_VIEWER, "Viewer"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_VIEWER)

    class Meta:
        unique_together = ("user", "organization")


class SaaSModule(models.Model):
    GROUP_BASE = "base"
    GROUP_OPERATIONS = "operations"
    GROUP_GROWTH = "growth"
    GROUP_FINANCE = "finance"
    GROUP_PREMIUM = "premium"

    GROUP_CHOICES = [
        (GROUP_BASE, "Base"),
        (GROUP_OPERATIONS, "Operación"),
        (GROUP_GROWTH, "Crecimiento"),
        (GROUP_FINANCE, "Finanzas"),
        (GROUP_PREMIUM, "Premium"),
    ]

    code = models.SlugField(unique=True)
    name = models.CharField(max_length=140)
    group = models.CharField(max_length=20, choices=GROUP_CHOICES, default=GROUP_BASE)
    description = models.TextField(blank=True, default="")
    route_hint = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["group", "sort_order", "name"]

    def __str__(self) -> str:
        return f"{self.group}:{self.name}"


class SaaSPlan(models.Model):
    BILLING_MONTHLY = "monthly"
    BILLING_ANNUAL = "annual"

    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Mensual"),
        (BILLING_ANNUAL, "Anual"),
    ]

    code = models.SlugField(unique=True)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    annual_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    recommended_billing_cycle = models.CharField(max_length=20, choices=BILLING_CHOICES, default=BILLING_MONTHLY)
    modules = models.ManyToManyField(SaaSModule, through="SaaSPlanModule", related_name="plans")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class SaaSPlanModule(models.Model):
    plan = models.ForeignKey(SaaSPlan, on_delete=models.CASCADE, related_name="plan_modules")
    module = models.ForeignKey(SaaSModule, on_delete=models.CASCADE, related_name="module_plans")
    is_included = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["plan_id", "sort_order", "module__name"]
        constraints = [
            models.UniqueConstraint(fields=["plan", "module"], name="uq_plan_module"),
        ]

    def __str__(self) -> str:
        return f"{self.plan.code}:{self.module.code}"


class Subscription(models.Model):
    PLAN_STARTER = "starter"
    PLAN_GROWTH = "growth"
    PLAN_PRO = "pro"

    PLAN_CHOICES = [
        (PLAN_STARTER, "Starter"),
        (PLAN_GROWTH, "Growth"),
        (PLAN_PRO, "Pro"),
    ]

    STATUS_TRIAL = "trial"
    STATUS_ACTIVE = "active"
    STATUS_PAST_DUE = "past_due"
    STATUS_SUSPENDED = "suspended"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_TRIAL, "Prueba"),
        (STATUS_ACTIVE, "Activa"),
        (STATUS_PAST_DUE, "Pendiente de pago"),
        (STATUS_SUSPENDED, "Suspendida"),
        (STATUS_CANCELLED, "Cancelada"),
    ]

    BILLING_MONTHLY = "monthly"
    BILLING_ANNUAL = "annual"
    BILLING_CUSTOM = "custom"

    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Mensual"),
        (BILLING_ANNUAL, "Anual"),
        (BILLING_CUSTOM, "Personalizado"),
    ]

    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="subscription")
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_STARTER)
    plan_catalog = models.ForeignKey(SaaSPlan, null=True, blank=True, on_delete=models.SET_NULL, related_name="subscriptions")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_TRIAL)
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CHOICES, default=BILLING_MONTHLY)
    is_active = models.BooleanField(default=True)
    started_at = models.DateField(auto_now_add=True)
    trial_ends_at = models.DateField(null=True, blank=True)
    expires_at = models.DateField(null=True, blank=True)
    next_billing_date = models.DateField(null=True, blank=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["organization__name"]

    def __str__(self) -> str:
        return f"{self.organization.slug} - {self.plan_catalog.code if self.plan_catalog_id else self.plan}"


class SubscriptionModule(models.Model):
    SOURCE_PLAN = "plan"
    SOURCE_ADDON = "addon"
    SOURCE_CUSTOM = "custom"

    SOURCE_CHOICES = [
        (SOURCE_PLAN, "Plan"),
        (SOURCE_ADDON, "Add-on"),
        (SOURCE_CUSTOM, "Personalizado"),
    ]

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="subscription_modules")
    module = models.ForeignKey(SaaSModule, on_delete=models.CASCADE, related_name="subscription_links")
    is_enabled = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_PLAN)
    activated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["subscription_id", "module__group", "module__sort_order", "module__name"]
        constraints = [
            models.UniqueConstraint(fields=["subscription", "module"], name="uq_subscription_module"),
        ]

    def __str__(self) -> str:
        return f"{self.subscription_id}:{self.module.code}:{self.is_enabled}"


class OrganizationFeatureFlag(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="feature_flags")
    module = models.ForeignKey(SaaSModule, null=True, blank=True, on_delete=models.SET_NULL, related_name="feature_flags")
    key = models.SlugField()
    label = models.CharField(max_length=140)
    description = models.CharField(max_length=255, blank=True, default="")
    is_enabled = models.BooleanField(default=False)
    config = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization_id", "key"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "key"], name="uq_org_feature_flag"),
        ]

    def __str__(self) -> str:
        return f"{self.organization_id}:{self.key}"
