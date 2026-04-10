from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models


class Organization(models.Model):
    DIGITS_3 = RegexValidator(r"^\d{3}$", "Debe contener exactamente 3 dígitos.")
    DIGITS_5 = RegexValidator(r"^\d{5}$", "Debe contener exactamente 5 dígitos.")

    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    parent_organization = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="child_organizations")
    hacienda_branch_code = models.CharField(max_length=3, default="001", validators=[DIGITS_3])
    hacienda_terminal_code = models.CharField(max_length=5, default="00001", validators=[DIGITS_5])
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


class Subscription(models.Model):
    PLAN_STARTER = "starter"
    PLAN_GROWTH = "growth"
    PLAN_PRO = "pro"

    PLAN_CHOICES = [
        (PLAN_STARTER, "Starter"),
        (PLAN_GROWTH, "Growth"),
        (PLAN_PRO, "Pro"),
    ]

    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default=PLAN_STARTER)
    is_active = models.BooleanField(default=True)
    started_at = models.DateField(auto_now_add=True)
    expires_at = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.organization.slug} - {self.plan}"
