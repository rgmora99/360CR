from django.db import migrations


def include_agenda_flow_modules_in_base_plan(apps, schema_editor):
    SaaSModule = apps.get_model("tenants", "SaaSModule")
    SaaSPlan = apps.get_model("tenants", "SaaSPlan")
    SaaSPlanModule = apps.get_model("tenants", "SaaSPlanModule")
    Subscription = apps.get_model("tenants", "Subscription")
    SubscriptionModule = apps.get_model("tenants", "SubscriptionModule")

    defaults = {
        "inventory": {
            "name": "Inventario",
            "group": "operations",
            "description": "Control de inventario, productos y servicios.",
            "route_hint": "/inventario.html",
            "sort_order": 50,
        },
        "suppliers": {
            "name": "Proveedores",
            "group": "operations",
            "description": "Gestion de proveedores.",
            "route_hint": "/suppliers.html",
            "sort_order": 70,
        },
    }

    module_map = {}
    for code, values in defaults.items():
        module, _created = SaaSModule.objects.update_or_create(
            code=code,
            defaults={**values, "is_active": True, "is_public": True},
        )
        module_map[code] = module

    base_plan = SaaSPlan.objects.filter(code="base").first()
    if not base_plan:
        return

    base_plan.description = "Clientes, agenda, servicios, proveedores, facturacion basica y dashboard."
    base_plan.save(update_fields=["description", "updated_at"])

    existing_count = SaaSPlanModule.objects.filter(plan=base_plan).count()
    for offset, code in enumerate(("inventory", "suppliers"), start=1):
        SaaSPlanModule.objects.update_or_create(
            plan=base_plan,
            module=module_map[code],
            defaults={"is_included": True, "sort_order": existing_count + offset},
        )

    included_ids = list(
        base_plan.plan_modules.filter(is_included=True).values_list("module_id", flat=True)
    )
    for subscription in Subscription.objects.filter(plan_catalog=base_plan).iterator():
        current_links = {
            link.module_id: link
            for link in SubscriptionModule.objects.filter(subscription=subscription)
        }
        for module_id in included_ids:
            link = current_links.get(module_id)
            if link:
                updates = []
                if link.source != "plan":
                    link.source = "plan"
                    updates.append("source")
                if not link.is_enabled:
                    link.is_enabled = True
                    updates.append("is_enabled")
                if updates:
                    link.save(update_fields=[*updates, "updated_at"])
                continue
            SubscriptionModule.objects.create(
                subscription=subscription,
                module_id=module_id,
                source="plan",
                is_enabled=True,
            )


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0006_organization_is_active"),
    ]

    operations = [
        migrations.RunPython(include_agenda_flow_modules_in_base_plan, migrations.RunPython.noop),
    ]
