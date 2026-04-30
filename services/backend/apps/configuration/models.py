from django.conf import settings
from django.db import models

from apps.tenants.models import Organization


class RoleCatalog(models.Model):
    PERSONA_IT_ADMIN = "it_admin"
    PERSONA_BUSINESS_MANAGER = "business_manager"
    PERSONA_CROSS_FUNCTIONAL = "cross_functional"

    PERSONA_CHOICES = [
        (PERSONA_IT_ADMIN, "Administrador de TI"),
        (PERSONA_BUSINESS_MANAGER, "Jefatura / Dirección"),
        (PERSONA_CROSS_FUNCTIONAL, "Uso transversal"),
    ]

    code = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    persona = models.CharField(max_length=30, choices=PERSONA_CHOICES)
    description = models.TextField()
    typical_scenarios = models.TextField()
    default_permissions = models.JSONField(default=list, blank=True)
    is_system_default = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["persona", "name"]

    def __str__(self) -> str:
        return self.name


class SystemSetting(models.Model):
    CATEGORY_SECURITY = "security"
    CATEGORY_OPERATIONS = "operations"
    CATEGORY_FINANCE = "finance"
    CATEGORY_NOTIFICATIONS = "notifications"

    CATEGORY_CHOICES = [
        (CATEGORY_SECURITY, "Seguridad"),
        (CATEGORY_OPERATIONS, "Operaciones"),
        (CATEGORY_FINANCE, "Finanzas"),
        (CATEGORY_NOTIFICATIONS, "Notificaciones"),
    ]

    key = models.SlugField(unique=True)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, default=CATEGORY_OPERATIONS)
    description = models.CharField(max_length=220)
    value = models.JSONField(default=dict, blank=True)
    is_sensitive = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "key"]

    def __str__(self) -> str:
        return self.key


class UserPreference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences")
    language = models.CharField(max_length=20, default="es")
    timezone = models.CharField(max_length=60, default="UTC")
    notifications_email = models.BooleanField(default=True)
    notifications_sms = models.BooleanField(default=False)
    dashboard_widgets = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Preferencias de {self.user_id}"


class UserRoleAssignment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(RoleCatalog, on_delete=models.PROTECT, related_name="user_assignments")
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.CASCADE)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_roles",
    )
    is_active = models.BooleanField(default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "role", "organization"], name="uq_user_role_org")
        ]
        ordering = ["-assigned_at"]

    def __str__(self) -> str:
        scope = self.organization_id if self.organization_id else "global"
        return f"{self.user_id}:{self.role.code}:{scope}"


class OrganizationEmailInbox(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="email_inboxes")
    label = models.CharField(max_length=80, default="Principal")
    email = models.EmailField()
    username = models.CharField(max_length=120)
    password = models.CharField(max_length=200)
    imap_host = models.CharField(max_length=120, default="imap.gmail.com")
    imap_port = models.PositiveIntegerField(default=993)
    imap_ssl = models.BooleanField(default=True)
    folder = models.CharField(max_length=80, default="INBOX")
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization_id", "-is_primary", "label", "email"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "email"], name="uq_org_email_inbox"),
            models.UniqueConstraint(
                fields=["organization"],
                condition=models.Q(is_primary=True),
                name="uq_org_primary_email_inbox",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.organization_id}:{self.email}"
