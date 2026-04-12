from django.db import models
from apps.accounts.models import TB_NEGOCIOS
from apps.gastos.models.model import CategoriaGasto  # si estás en otro archivo, ajustá

class GastoFijo(models.Model):
    negocio = models.ForeignKey(
        TB_NEGOCIOS,
        on_delete=models.CASCADE,
        related_name="gastos_fijos"
    )

    nombre = models.CharField(max_length=120)

    # Reglas de detección
    proveedor_match = models.CharField(
        max_length=150,
        help_text="Texto que debe contener el proveedor (case-insensitive)"
    )

    numero_factura_prefijo = models.CharField(
        max_length=50,
        blank=True, null=True,
        help_text="Opcional: prefijo del número de factura"
    )

    # Config del gasto
    categoria = models.ForeignKey(CategoriaGasto, on_delete=models.PROTECT)
    metodo_pago = models.CharField(max_length=30, blank=True, null=True)

    # Comportamiento
    auto_registrar = models.BooleanField(default=True)
    activo = models.BooleanField(default=True)

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["negocio", "activo"]),
            models.Index(fields=["negocio", "proveedor_match"]),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.negocio_id})"