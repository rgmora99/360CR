# apps/gastos/forms.py
from django import forms
from apps.gastos.models import GastoFijo, CategoriaGasto

class GastoFijoForm(forms.ModelForm):

    def __init__(self, *args, **kwargs):
        negocio_id = kwargs.pop("negocio_id", None)  # 👈 quitamos el extra
        super().__init__(*args, **kwargs)

        if negocio_id:
            # Filtrar categorías SOLO del negocio activo
            self.fields["categoria"].queryset = CategoriaGasto.objects.filter(
                negocio_id=negocio_id,
                activo=True
            )

    class Meta:
        model = GastoFijo
        fields = [
            "nombre",
            "proveedor_match",
            "numero_factura_prefijo",
            "categoria",
            "metodo_pago",
            "auto_registrar",
            "activo",
        ]