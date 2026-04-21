from django.db import migrations


def seed_saas_catalog(apps, schema_editor):
    Organization = apps.get_model("tenants", "Organization")
    SaaSModule = apps.get_model("tenants", "SaaSModule")
    SaaSPlan = apps.get_model("tenants", "SaaSPlan")
    SaaSPlanModule = apps.get_model("tenants", "SaaSPlanModule")
    Subscription = apps.get_model("tenants", "Subscription")
    SubscriptionModule = apps.get_model("tenants", "SubscriptionModule")

    modules = [
        ("dashboard", "Dashboard", "base", "Resumen general del negocio.", "/dashboard.html", 10),
        ("customers", "Clientes", "base", "Gestión de clientes y expedientes.", "/customers.html", 20),
        ("agenda", "Agenda", "base", "Citas, disponibilidad y reservas.", "/agenda.html", 30),
        ("billing_basic", "Facturación básica", "base", "Facturación operativa del negocio.", "/facturacion.html", 40),
        ("inventory", "Inventario", "operations", "Control de inventario y stock.", "/inventario.html", 50),
        ("purchases", "Compras", "operations", "Registro de compras e ingresos.", "/compras.html", 60),
        ("suppliers", "Proveedores", "operations", "Gestión de proveedores.", "/suppliers.html", 70),
        ("shipping", "Envíos", "operations", "Despachos y entregas.", "/envios.html", 80),
        ("loyalty", "Fidelización", "growth", "Acumulación y canje de puntos.", "/fidelizacion.html", 90),
        ("campaigns", "Campañas", "growth", "Campañas y comunicación comercial.", "", 100),
        ("reminders", "Recordatorios", "growth", "Recordatorios automáticos de citas y cobros.", "", 110),
        ("crm_light", "CRM ligero", "growth", "Seguimiento comercial liviano.", "", 120),
        ("receivables", "Cuentas por cobrar", "finance", "Gestión de saldos y pagos.", "/cuentas-cobrar.html", 130),
        ("credit", "Crédito", "finance", "Control de crédito por cliente.", "/cuentas-cobrar.html", 140),
        ("reports", "Reportes", "finance", "Reportes operativos y financieros.", "", 150),
        ("closures", "Cierres", "finance", "Cierre y control operativo.", "", 160),
        ("automation", "Automatizaciones", "premium", "Automatizaciones y reglas avanzadas.", "", 170),
        ("audit", "Auditoría", "premium", "Bitácora y trazabilidad.", "", 180),
        ("advanced_reports", "Reportes avanzados", "premium", "Analítica avanzada por negocio.", "", 190),
        ("multiuser_permissions", "Multiusuario con permisos", "premium", "Gestión avanzada de usuarios y permisos.", "/configuraciones.html", 200),
    ]

    module_map = {}
    for code, name, group, description, route_hint, sort_order in modules:
        module, _ = SaaSModule.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "group": group,
                "description": description,
                "route_hint": route_hint,
                "is_active": True,
                "is_public": True,
                "sort_order": sort_order,
            },
        )
        module_map[code] = module

    plans = [
        ("base", "Base", "Clientes, agenda, facturación básica y dashboard.", 19, 190, 10, ["dashboard", "customers", "agenda", "billing_basic"]),
        ("operations", "Operación", "Inventario, compras, proveedores y envíos.", 12, 120, 20, ["inventory", "purchases", "suppliers", "shipping"]),
        ("growth", "Crecimiento", "Fidelización, campañas, recordatorios y CRM ligero.", 15, 150, 30, ["loyalty", "campaigns", "reminders", "crm_light"]),
        ("finance", "Finanzas", "Cuentas por cobrar, crédito, reportes y cierres.", 18, 180, 40, ["receivables", "credit", "reports", "closures"]),
        ("premium", "Premium", "Automatizaciones, auditoría, reportes avanzados y multiusuario.", 25, 250, 50, ["automation", "audit", "advanced_reports", "multiuser_permissions"]),
    ]

    for code, name, description, monthly_price, annual_price, sort_order, plan_modules in plans:
        plan, _ = SaaSPlan.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "description": description,
                "monthly_price": monthly_price,
                "annual_price": annual_price,
                "sort_order": sort_order,
                "is_active": True,
                "recommended_billing_cycle": "monthly",
            },
        )
        for index, module_code in enumerate(plan_modules, start=1):
            SaaSPlanModule.objects.update_or_create(
                plan=plan,
                module=module_map[module_code],
                defaults={"is_included": True, "sort_order": index},
            )

    base_plan = SaaSPlan.objects.filter(code="base").first()
    for organization in Organization.objects.all():
        subscription, _ = Subscription.objects.get_or_create(
            organization=organization,
            defaults={
                "plan": "starter",
                "plan_catalog": base_plan,
                "status": "trial",
                "billing_cycle": "monthly",
                "base_price": getattr(base_plan, "monthly_price", 0) or 0,
            },
        )
        if not subscription.plan_catalog_id and base_plan:
            subscription.plan_catalog = base_plan
            if not subscription.base_price:
                subscription.base_price = base_plan.monthly_price
            subscription.save(update_fields=["plan_catalog", "base_price"])

        included_ids = list(
            subscription.plan_catalog.plan_modules.filter(is_included=True).values_list("module_id", flat=True)
        ) if subscription.plan_catalog_id else []
        SubscriptionModule.objects.filter(subscription=subscription, source="plan").exclude(module_id__in=included_ids).delete()
        current_ids = set(subscription.subscription_modules.values_list("module_id", flat=True))
        for module_id in included_ids:
            if module_id in current_ids:
                continue
            SubscriptionModule.objects.create(
                subscription=subscription,
                module_id=module_id,
                source="plan",
                is_enabled=True,
            )


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0004_saasmodule_saasplan_alter_subscription_options_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_saas_catalog, migrations.RunPython.noop),
    ]
