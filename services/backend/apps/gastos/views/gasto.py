from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render
from django.contrib.auth.decorators import login_required

from apps.gastos.models import FacturaGasto, CategoriaGasto, Gasto


@login_required
@transaction.atomic
def registrar_gasto(request, factura_id):

    factura = (
        FacturaGasto.objects.select_for_update().select_related("negocio").get(id=factura_id)
    )

    if hasattr(factura, "gasto"):
        return redirect("gastos:ver_gasto", factura.gasto.id)

    if factura.estado == "pendiente":
        factura.estado = "en_registro"
        factura.save(update_fields=["estado"])

    if request.method == "POST":
        categoria_id = request.POST.get("categoria")
        fecha_gasto = request.POST.get("fecha_gasto")
        metodo_pago = request.POST.get("metodo_pago")
        notas = request.POST.get("notas")

        Gasto.objects.create(
            negocio=factura.negocio,
            factura=factura,
            categoria_id=categoria_id,
            fecha_gasto=fecha_gasto,
            metodo_pago=metodo_pago,
            subtotal=factura.subtotal,
            iva=factura.iva,
            total=factura.total,
            notas=notas,
            creado_por=request.user,
        )

        factura.estado = "registrada"
        factura.save(update_fields=["estado"])

        return redirect("gastos:bandeja_facturas")

    return render(
        request,
        "gastos/registrar_gasto.html",
        {
            "factura": factura,
            "categorias": CategoriaGasto.objects.filter(negocio=factura.negocio, activo=True),
        },
    )


@login_required
def ver_gasto(request, gasto_id):
    gasto = get_object_or_404(
        Gasto.objects.select_related("factura", "categoria"),
        id=gasto_id,
    )
    return render(request, "gastos/ver_factura.html", {"gasto": gasto})


@login_required
def listado_gastos(request):
    negocio_id = request.session.get("negocio_activo_id")
    if not negocio_id:
        return redirect("core:home")

    gastos = (
        Gasto.objects.filter(negocio_id=negocio_id)
        .select_related("categoria", "factura")
        .order_by("-fecha_gasto")
    )

    q = (request.GET.get("q") or "").strip()
    categoria = (request.GET.get("categoria") or "").strip()
    metodo_pago = (request.GET.get("metodo_pago") or "").strip()
    fecha_desde = (request.GET.get("fecha_desde") or "").strip()
    fecha_hasta = (request.GET.get("fecha_hasta") or "").strip()

    if q:
        gastos = gastos.filter(
            Q(factura__proveedor__icontains=q) | Q(factura__numero_factura__icontains=q)
        )

    if categoria:
        gastos = gastos.filter(categoria_id=categoria)

    if metodo_pago:
        gastos = gastos.filter(metodo_pago=metodo_pago)

    if fecha_desde:
        gastos = gastos.filter(fecha_gasto__gte=fecha_desde)

    if fecha_hasta:
        gastos = gastos.filter(fecha_gasto__lte=fecha_hasta)

    context = {
        "gastos": gastos,
        "categorias": CategoriaGasto.objects.filter(negocio_id=negocio_id, activo=True),
        "filtros": {
            "q": q,
            "categoria": categoria,
            "metodo_pago": metodo_pago,
            "fecha_desde": fecha_desde,
            "fecha_hasta": fecha_hasta,
        },
        "kpi": {
            "total": gastos.count(),
            "registrados": gastos.filter(estado="registrado").count(),
            "anulados": gastos.filter(estado="anulado").count(),
        },
    }

    return render(request, "gastos/listado_gastos.html", context)


@login_required
def anular_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)
    gasto.estado = "anulado"
    gasto.save(update_fields=["estado"])
    return redirect("gastos:listado_gastos")


@login_required
def editar_gasto(request, gasto_id):
    gasto = get_object_or_404(Gasto, id=gasto_id)

    if request.method == "POST":
        gasto.categoria_id = request.POST.get("categoria")
        gasto.fecha_gasto = request.POST.get("fecha_gasto")
        gasto.metodo_pago = request.POST.get("metodo_pago")
        gasto.notas = request.POST.get("notas")
        gasto.save()

        return redirect("gastos:listado_gastos")

    categorias = CategoriaGasto.objects.filter(negocio_id=gasto.negocio_id, activo=True)

    return render(
        request,
        "gastos/editar_gasto.html",
        {
            "gasto": gasto,
            "categorias": categorias,
        },
    )
