from django.db import transaction
from django.utils import timezone
from apps.gastos.models import GastoFijo, Gasto, FacturaGasto


def match_gasto_fijo(factura: FacturaGasto):
    """
    Retorna el primer GastoFijo que haga match con la factura.
    """
    reglas = GastoFijo.objects.filter(negocio=factura.negocio, activo=True).select_related("categoria")

    prov = (factura.proveedor or "").lower()
    num = (factura.numero_factura or "")

    for r in reglas:
        if (r.proveedor_match or "").lower() not in prov:
            continue

        if r.numero_factura_prefijo:
            if not num.startswith(r.numero_factura_prefijo):
                continue

        return r

    return None


@transaction.atomic
def aplicar_gasto_fijo_a_factura(factura: FacturaGasto):
    """
    - Si hay match, precarga categoria/metodo y cambia estado.
    - Si auto_registrar=True, crea Gasto (si no existe) y marca factura registrada.
    """
    # Si ya está registrada y tiene gasto, no hacer nada
    if hasattr(factura, "gasto"):
        return {"matched": False, "reason": "ya_tiene_gasto"}

    regla = match_gasto_fijo(factura)
    if not regla:
        return {"matched": False, "reason": "sin_match"}

    # Precarga en factura
    factura.categoria = regla.categoria
    factura.estado = "en_registro"
    factura.save(update_fields=["categoria", "estado"])

    if not regla.auto_registrar:
        return {"matched": True, "auto": False, "regla_id": regla.id}

    # Auto-registrar gasto (no duplicar)
    gasto = Gasto.objects.create(
        negocio=factura.negocio,
        factura=factura,
        categoria=regla.categoria,
        fecha_gasto=factura.fecha_emision,
        metodo_pago=regla.metodo_pago,
        subtotal=factura.subtotal,
        iva=factura.iva,
        total=factura.total,
        notas=f"[AUTO] Generado por gasto fijo: {regla.nombre}",
        activo=True,
        creado_por=factura.usuario_creacion,  # o None si querés "sistema"
    )

    factura.estado = "registrada"
    factura.save(update_fields=["estado"])

    return {"matched": True, "auto": True, "gasto_id": gasto.id, "regla_id": regla.id}