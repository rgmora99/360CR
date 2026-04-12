from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.contrib import messages

from apps.gastos.models import ConfigCorreoFactura
from apps.gastos.forms import ConfigCorreoFacturaForm
from apps.gastos.services import IMAPClient

@login_required
def config_correo_facturas(request):
    negocio_id = request.session.get("negocio_activo_id")
    if not negocio_id:
        messages.error(request, "No hay negocio activo en sesión.")
        return redirect("core:home")

    obj, _ = ConfigCorreoFactura.objects.get_or_create(
        negocio_id=negocio_id,
        defaults={
            "email": request.user.email or "correo@ejemplo.com",
            "username": request.user.email or "",
            "password": "",
        }
    )

    if request.method == "POST":
        form = ConfigCorreoFacturaForm(request.POST, instance=obj)
        if form.is_valid():
            cfg = form.save(commit=False)

            # Validación: probar conexión rápida (opcional, pero recomendado)
            try:
                client = IMAPClient(cfg.imap_host, cfg.imap_port, cfg.imap_ssl)
                client.connect(cfg.username, cfg.password)
                client.select_folder(cfg.carpeta)
                client.logout()
            except Exception as e:
                messages.error(request, f"No se pudo conectar al correo: {e}")
                return render(request, "gastos/config_correo_facturas.html", {"form": form})

            cfg.save()
            messages.success(request, "Configuración guardada y conexión OK.")
            return redirect("gastos:bandeja_facturas")
        else:
            messages.error(request, "Revisa los campos del formulario.")
    else:
        form = ConfigCorreoFacturaForm(instance=obj)

    return render(request, "gastos/config_correo_facturas.html", {"form": form})