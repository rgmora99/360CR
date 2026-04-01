from django.db import models
from apps.tenants.models import Organization


class SaaSModule(models.Model):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class Plan(models.Model):
    BILLING_MONTHLY = "monthly"
    BILLING_YEARLY = "yearly"
    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Mensual"),
        (BILLING_YEARLY, "Anual"),
    ]

    code = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    billing_cycle = models.CharField(max_length=20, choices=BILLING_CHOICES, default=BILLING_MONTHLY)
    base_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_free = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class PlanModule(models.Model):
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE)
    module = models.ForeignKey(SaaSModule, on_delete=models.CASCADE)
    included = models.BooleanField(default=True)

    class Meta:
        unique_together = ("plan", "module")


class OrganizationPlan(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    started_at = models.DateField(auto_now_add=True)
    active = models.BooleanField(default=True)


class OrganizationModuleAddon(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    module = models.ForeignKey(SaaSModule, on_delete=models.PROTECT)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("organization", "module")
