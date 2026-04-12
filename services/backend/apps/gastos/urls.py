from django.urls import path
from apps.gastos.views.acciones import aprobar_factura, rechazar_factura
from apps.gastos.views.correo_config import  config_correo_facturas 
from apps.gastos.views.bandeja import bandeja_facturas
from django.urls import path
from apps.gastos.views.sync import sync_facturas_ajax
from apps.gastos.views.gasto import registrar_gasto,ver_gasto,listado_gastos,anular_gasto,editar_gasto
from apps.gastos.views.gastos_fijos import listado_gastos_fijos, crear_gasto_fijo, editar_gasto_fijo, cambiar_estado_gasto_fijo
app_name = "gastos"

urlpatterns = [
    path("config-correo-facturas/", config_correo_facturas, name="config_correo_facturas"),
    path("bandeja_facturas/", bandeja_facturas, name="bandeja_facturas"),
    path("facturas/<int:factura_id>/aprobar/", aprobar_factura, name="aprobar_factura"),
    path("facturas/<int:factura_id>/rechazar/", rechazar_factura, name="rechazar_factura"),
    path("sync-facturas/", sync_facturas_ajax, name="sync_facturas_ajax"),

    path("registrar/<int:factura_id>/", registrar_gasto, name="registrar"),
    path("gasto/<int:gasto_id>/", ver_gasto, name="ver_gasto"),
    path("listado/", listado_gastos, name="listado_gastos"),
    path("gastos/anular/<int:gasto_id>/", anular_gasto, name="anular_gasto"),
    path("editar/<int:gasto_id>/", editar_gasto, name="editar_gasto"),

    path("gastos_fijos/", listado_gastos_fijos, name="gastos_fijos"),
    path("gastos_fijos/nuevo/", crear_gasto_fijo, name="crear_gasto_fijo"),
    path("gastos_fijos/<int:id>/editar/", editar_gasto_fijo, name="editar_gasto_fijo"),
    path("gastos_fijos/<int:id>/toggle/", cambiar_estado_gasto_fijo, name="toggle_gasto_fijo"),
]