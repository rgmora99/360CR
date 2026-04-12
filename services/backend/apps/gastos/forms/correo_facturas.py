from django import forms
from apps.gastos.models import ConfigCorreoFactura

class ConfigCorreoFacturaForm(forms.ModelForm):
    class Meta:
        model = ConfigCorreoFactura
        fields = [
            "imap_host", "imap_port", "imap_ssl",
            "email", "username", "password",
            "carpeta", "activo"
        ]
        widgets = {
            "imap_host": forms.TextInput(attrs={"class": "form-control"}),
            "imap_port": forms.NumberInput(attrs={"class": "form-control"}),
            "imap_ssl": forms.CheckboxInput(attrs={"class": "form-check-input"}),
            "email": forms.EmailInput(attrs={"class": "form-control"}),
            "username": forms.TextInput(attrs={"class": "form-control"}),
            "password": forms.PasswordInput(attrs={"class": "form-control", "autocomplete": "new-password"}),
            "carpeta": forms.TextInput(attrs={"class": "form-control"}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def clean_imap_port(self):
        port = self.cleaned_data["imap_port"]
        if port <= 0 or port > 65535:
            raise forms.ValidationError("Puerto IMAP inválido.")
        return port