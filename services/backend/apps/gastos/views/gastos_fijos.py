from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404

from apps.gastos.models import GastoFijo
from apps.gastos.forms.gastos_fijos import GastoFijoForm


@login_required
def listado_gastos_fijos(request):
    negocio_id = request.session.get("negocio_activo_id")
    qs = GastoFijo.objects.filter(negocio_id=negocio_id).select_related("categoria").order_by("-activo", "nombre")

    return render(request, "gastos/gastos_fijos_listado.html", {
        "reglas": qs
    })


@login_required
def crear_gasto_fijo(request):
    negocio_id = request.session.get("negocio_activo_id")

    if request.method == "POST":
        form = GastoFijoForm(request.POST, negocio_id=negocio_id)
        if form.is_valid():
            obj = form.save(commit=False)
            obj.negocio_id = negocio_id
            obj.save()
            return redirect("gastos:gastos_fijos")
    else:
        form = GastoFijoForm(negocio_id=negocio_id)

    return render(request, "gastos/registrar_gasto_fijo.html", {
        "form": form,
        "modo": "crear"
    })


@login_required
def editar_gasto_fijo(request, id):
    negocio_id = request.session.get("negocio_activo_id")
    regla = get_object_or_404(GastoFijo, id=id, negocio_id=negocio_id)

    if request.method == "POST":
        form = GastoFijoForm(request.POST, instance=regla, negocio_id=negocio_id)
        if form.is_valid():
            form.save()
            return redirect("gastos:gastos_fijos")
    else:
        form = GastoFijoForm(instance=regla, negocio_id=negocio_id)

    return render(request, "gastos/gastos_fijos_form.html", {
        "form": form,
        "modo": "editar",
        "regla": regla
    })


@login_required
def cambiar_estado_gasto_fijo(request, id):
    negocio_id = request.session.get("negocio_activo_id")
    regla = get_object_or_404(GastoFijo, id=id, negocio_id=negocio_id)

    regla.activo = not regla.activo
    regla.save(update_fields=["activo"])
    return redirect("gastos:gastos_fijos")