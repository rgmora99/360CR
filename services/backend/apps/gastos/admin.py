from django.contrib import admin
from .models import CategoriaGasto

@admin.register(CategoriaGasto)
class CategoriaGastoAdmin(admin.ModelAdmin):
    list_display = ("id", "negocio", "nombre", "activo")
    list_filter = ("negocio", "activo")
    search_fields = ("nombre",)