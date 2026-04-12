from django import forms

class FiltroBandejaFacturasForm(forms.Form):
    q = forms.CharField(required=False, widget=forms.TextInput(attrs={
        "class": "form-control", "placeholder": "Buscar proveedor o # factura..."
    }))

    estado = forms.ChoiceField(required=False, choices=[
        ("", "Todos"),
        ("pendiente", "Pendiente"),
        ("en_registro", "En registro"),
        ("registrada", "Registrada"),
        ("rechazada", "Rechazada"),
    ], widget=forms.Select(attrs={"class": "form-control"}))