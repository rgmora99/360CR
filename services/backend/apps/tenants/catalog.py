DEFAULT_SAAS_MODULES = [
    ("dashboard", "Dashboard", "base", "Resumen general del negocio.", "/dashboard.html", 10),
    ("customers", "Clientes", "base", "Gestion de clientes y expedientes.", "/customers.html", 20),
    ("agenda", "Agenda", "base", "Citas, disponibilidad y reservas.", "/agenda.html", 30),
    ("billing_basic", "Facturacion basica", "base", "Facturacion operativa del negocio.", "/facturacion.html", 40),
    ("inventory", "Inventario", "operations", "Control de inventario y stock.", "/inventario.html", 50),
    ("purchases", "Compras", "operations", "Registro de compras e ingresos.", "/compras.html", 60),
    ("suppliers", "Proveedores", "operations", "Gestion de proveedores.", "/suppliers.html", 70),
    ("shipping", "Envios", "operations", "Despachos y entregas.", "/envios.html", 80),
    ("loyalty", "Fidelizacion", "growth", "Acumulacion y canje de puntos.", "/fidelizacion.html", 90),
    ("campaigns", "Campanas", "growth", "Campanas y comunicacion comercial.", "", 100),
    ("reminders", "Recordatorios", "growth", "Recordatorios automaticos de citas y cobros.", "", 110),
    ("crm_light", "CRM ligero", "growth", "Seguimiento comercial liviano.", "", 120),
    ("receivables", "Cuentas por cobrar", "finance", "Gestion de saldos y pagos.", "/cuentas-cobrar.html", 130),
    ("credit", "Credito", "finance", "Control de credito por cliente.", "/cuentas-cobrar.html", 140),
    ("reports", "Reportes", "finance", "Reportes operativos y financieros.", "/reporteria.html", 150),
    ("closures", "Cierres", "finance", "Cierre y control operativo.", "", 160),
    ("automation", "Automatizaciones", "premium", "Automatizaciones y reglas avanzadas.", "", 170),
    ("audit", "Auditoria", "premium", "Bitacora y trazabilidad.", "", 180),
    ("advanced_reports", "Reportes avanzados", "premium", "Analitica avanzada por negocio.", "/reporteria.html", 190),
    ("multiuser_permissions", "Multiusuario con permisos", "premium", "Gestion avanzada de usuarios y permisos.", "/configuraciones.html", 200),
]

DEFAULT_SAAS_PLANS = [
    (
        "base",
        "Base",
        "Clientes, agenda, servicios, proveedores, facturacion basica y dashboard.",
        19,
        190,
        10,
        ["dashboard", "customers", "agenda", "billing_basic", "inventory", "suppliers"],
    ),
    ("operations", "Operacion", "Inventario, compras, proveedores y envios.", 12, 120, 20, ["inventory", "purchases", "suppliers", "shipping"]),
    ("growth", "Crecimiento", "Fidelizacion, campanas, recordatorios y CRM ligero.", 15, 150, 30, ["loyalty", "campaigns", "reminders", "crm_light"]),
    ("finance", "Finanzas", "Cuentas por cobrar, credito, reportes y cierres.", 18, 180, 40, ["receivables", "credit", "reports", "closures"]),
    ("premium", "Premium", "Automatizaciones, auditoria, reportes avanzados y multiusuario.", 25, 250, 50, ["automation", "audit", "advanced_reports", "multiuser_permissions"]),
]


def ensure_default_saas_catalog():
    from apps.tenants.models import SaaSModule, SaaSPlan, SaaSPlanModule

    module_map = {}
    for code, name, group, description, route_hint, sort_order in DEFAULT_SAAS_MODULES:
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

    for code, name, description, monthly_price, annual_price, sort_order, module_codes in DEFAULT_SAAS_PLANS:
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
        for index, module_code in enumerate(module_codes, start=1):
            SaaSPlanModule.objects.update_or_create(
                plan=plan,
                module=module_map[module_code],
                defaults={"is_included": True, "sort_order": index},
            )
