from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.contrib import messages

from apps.gastos.models import FacturaGasto

@login_required
def aprobar_factura(request, factura_id):
    negocio_id = request.session.get("negocio_activo_id")
    factura = get_object_or_404(FacturaGasto, id=factura_id, negocio_id=negocio_id)
    factura.estado = "validada"
    factura.save(update_fields=["estado"])
    messages.success(request, "Factura aprobada.")
    return redirect("gastos:bandeja_facturas")

@login_required
def rechazar_factura(request, factura_id):
    negocio_id = request.session.get("negocio_activo_id")
    factura = get_object_or_404(FacturaGasto, id=factura_id, negocio_id=negocio_id)
    factura.estado = "rechazada"
    factura.save(update_fields=["estado"])
    messages.warning(request, "Factura rechazada.")
    return redirect("gastos:bandeja_facturas")