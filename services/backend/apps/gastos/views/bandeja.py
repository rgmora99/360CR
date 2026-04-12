from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.db.models import Q
from django.core.paginator import Paginator

from apps.gastos.models import FacturaGasto
from apps.gastos.forms import FiltroBandejaFacturasForm


@login_required
def bandeja_facturas(request):
    negocio_id = request.session.get("negocio_activo_id")

    if not negocio_id:
        return redirect("core:home")

    form = FiltroBandejaFacturasForm(request.GET or None)

    base_qs = FacturaGasto.objects.filter(
        negocio_id=negocio_id,
        estado__in=["pendiente", "en_registro"],
    ).order_by("-fecha_emision")

    qs = base_qs

    if form.is_valid():
        q = (form.cleaned_data.get("q") or "").strip()
        estado = form.cleaned_data.get("estado")

        if estado:
            qs = qs.filter(estado=estado)

        if q:
            qs = qs.filter(
                Q(proveedor__icontains=q) | Q(numero_factura__icontains=q)
            )

    kpi = {
        "pendientes": base_qs.filter(estado="pendiente").count(),
        "en_registro": base_qs.filter(estado="en_registro").count(),
        "total_bandeja": base_qs.count(),
        "total_filtrado": qs.count(),
    }

    paginator = Paginator(qs, 10)
    page_number = request.GET.get("page")
    facturas = paginator.get_page(page_number)

    query_string = request.GET.copy()
    if "page" in query_string:
        query_string.pop("page")

    return render(
        request,
        "gastos/bandeja_facturas.html",
        {
            "form": form,
            "facturas": facturas,
            "kpi": kpi,
            "query_string": query_string.urlencode(),
        },
    )
