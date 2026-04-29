from django.db import migrations


def update_small_business_roles(apps, schema_editor):
    RoleCatalog = apps.get_model("configuration", "RoleCatalog")
    roles = [
        {
            "code": "gerencia-general",
            "name": "Dueño / Administrador",
            "persona": "business_manager",
            "description": "Control general del negocio: ventas, compras, clientes, caja y reportes.",
            "typical_scenarios": "Revisar resultados diarios, aprobar ajustes importantes, dar seguimiento a pagos y operación.",
            "default_permissions": ["dashboards.executive", "reports.read", "approvals.high"],
        },
        {
            "code": "jefe-finanzas",
            "name": "Caja y facturación",
            "persona": "business_manager",
            "description": "Emite facturas, registra pagos y consulta saldos de clientes.",
            "typical_scenarios": "Facturar ventas, aplicar pagos, revisar cuentas por cobrar y cierres de caja.",
            "default_permissions": ["invoices.manage", "credit.manage", "reports.finance"],
        },
        {
            "code": "jefe-operaciones",
            "name": "Inventario y compras",
            "persona": "business_manager",
            "description": "Administra productos, existencias, proveedores y compras del negocio.",
            "typical_scenarios": "Registrar compras, revisar stock, actualizar productos y coordinar proveedores.",
            "default_permissions": ["inventory.manage", "suppliers.manage", "operations.kpi"],
        },
        {
            "code": "analista-multiarea",
            "name": "Consulta y reportes",
            "persona": "cross_functional",
            "description": "Consulta información y reportes sin realizar cambios críticos.",
            "typical_scenarios": "Ver clientes, revisar reportes, preparar información para seguimiento interno.",
            "default_permissions": ["customers.read", "suppliers.read", "reports.read"],
        },
        {
            "code": "ti-seguridad",
            "name": "Administrador de usuarios",
            "persona": "it_admin",
            "description": "Gestiona usuarios, accesos y bloqueos básicos dentro del negocio.",
            "typical_scenarios": "Crear usuarios, actualizar accesos, bloquear cuentas y revisar actividad básica.",
            "default_permissions": ["users.read", "users.lock", "security.manage", "audit.read"],
        },
        {
            "code": "ti-soporte",
            "name": "Soporte operativo",
            "persona": "it_admin",
            "description": "Ayuda con tareas operativas y soporte sin permisos financieros sensibles.",
            "typical_scenarios": "Apoyar navegación, revisar incidencias, validar datos operativos y actualizar usuarios.",
            "default_permissions": ["users.read", "users.update", "tickets.manage"],
        },
    ]

    for role in roles:
        RoleCatalog.objects.update_or_create(code=role["code"], defaults=role)


class Migration(migrations.Migration):
    dependencies = [
        ("configuration", "0002_organizationemailinbox"),
    ]

    operations = [
        migrations.RunPython(update_small_business_roles, migrations.RunPython.noop),
    ]
