from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_default_roles(apps, schema_editor):
    RoleCatalog = apps.get_model("configuration", "RoleCatalog")
    roles = [
        {
            "code": "ti-super-admin",
            "name": "Super Administrador TI",
            "persona": "it_admin",
            "description": "Control total del sistema, seguridad, respaldos, integraciones y auditoría.",
            "typical_scenarios": "Alta de organizaciones, recuperación por incidente, gestión de claves, cumplimiento.",
            "default_permissions": ["*"],
        },
        {
            "code": "ti-seguridad",
            "name": "Administrador de Seguridad",
            "persona": "it_admin",
            "description": "Gestiona políticas de acceso, MFA, contraseñas y revisiones de riesgo.",
            "typical_scenarios": "Respuesta a alertas, bloqueo de cuentas, revisión de bitácoras.",
            "default_permissions": ["users.read", "users.lock", "security.manage", "audit.read"],
        },
        {
            "code": "ti-soporte",
            "name": "Soporte Técnico",
            "persona": "it_admin",
            "description": "Atiende incidencias operativas sin acceso a datos sensibles financieros.",
            "typical_scenarios": "Restablecer sesiones, soporte de navegación, validación de conectividad.",
            "default_permissions": ["users.read", "users.update", "tickets.manage"],
        },
        {
            "code": "gerencia-general",
            "name": "Gerencia General",
            "persona": "business_manager",
            "description": "Vista integral del negocio con capacidad de aprobar excepciones de alto impacto.",
            "typical_scenarios": "Aprobaciones especiales, revisión de KPIs globales, cambios de políticas.",
            "default_permissions": ["dashboards.executive", "reports.read", "approvals.high"],
        },
        {
            "code": "jefe-finanzas",
            "name": "Jefe de Finanzas",
            "persona": "business_manager",
            "description": "Controla facturación, crédito, límites de gasto y cierres contables.",
            "typical_scenarios": "Ajustes de crédito, cierre de mes, revisión de cuentas por cobrar/pagar.",
            "default_permissions": ["invoices.manage", "credit.manage", "reports.finance"],
        },
        {
            "code": "jefe-operaciones",
            "name": "Jefe de Operaciones",
            "persona": "business_manager",
            "description": "Orquesta inventario, proveedores, niveles de servicio y continuidad operativa.",
            "typical_scenarios": "Reposición urgente, negociación con proveedores, monitoreo de stock crítico.",
            "default_permissions": ["inventory.manage", "suppliers.manage", "operations.kpi"],
        },
        {
            "code": "analista-multiarea",
            "name": "Analista Multiárea",
            "persona": "cross_functional",
            "description": "Rol transversal para consulta y análisis con permisos limitados de edición.",
            "typical_scenarios": "Análisis de ventas, seguimiento de cartera, elaboración de reportes internos.",
            "default_permissions": ["customers.read", "suppliers.read", "reports.read"],
        },
    ]

    for role in roles:
        RoleCatalog.objects.update_or_create(code=role["code"], defaults=role)


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tenants", "0002_organization_parent_organization"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoleCatalog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(unique=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "persona",
                    models.CharField(
                        choices=[
                            ("it_admin", "Administrador de TI"),
                            ("business_manager", "Jefatura / Dirección"),
                            ("cross_functional", "Uso transversal"),
                        ],
                        max_length=30,
                    ),
                ),
                ("description", models.TextField()),
                ("typical_scenarios", models.TextField()),
                ("default_permissions", models.JSONField(blank=True, default=list)),
                ("is_system_default", models.BooleanField(default=True)),
            ],
            options={"ordering": ["persona", "name"]},
        ),
        migrations.CreateModel(
            name="SystemSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(unique=True)),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("security", "Seguridad"),
                            ("operations", "Operaciones"),
                            ("finance", "Finanzas"),
                            ("notifications", "Notificaciones"),
                        ],
                        default="operations",
                        max_length=40,
                    ),
                ),
                ("description", models.CharField(max_length=220)),
                ("value", models.JSONField(blank=True, default=dict)),
                ("is_sensitive", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["category", "key"]},
        ),
        migrations.CreateModel(
            name="UserPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("language", models.CharField(default="es", max_length=20)),
                ("timezone", models.CharField(default="UTC", max_length=60)),
                ("notifications_email", models.BooleanField(default=True)),
                ("notifications_sms", models.BooleanField(default=False)),
                ("dashboard_widgets", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="preferences", to=settings.AUTH_USER_MODEL),
                ),
            ],
        ),
        migrations.CreateModel(
            name="UserRoleAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("assigned_at", models.DateTimeField(auto_now_add=True)),
                (
                    "assigned_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="assigned_roles", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "organization",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to="tenants.organization"),
                ),
                ("role", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="user_assignments", to="configuration.rolecatalog")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="role_assignments", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-assigned_at"]},
        ),
        migrations.AddConstraint(
            model_name="userroleassignment",
            constraint=models.UniqueConstraint(fields=("user", "role", "organization"), name="uq_user_role_org"),
        ),
        migrations.RunPython(seed_default_roles, migrations.RunPython.noop),
    ]
