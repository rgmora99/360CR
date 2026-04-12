from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.utils.timezone import now

from apps.gastos.services.sync_facturas import sync_facturas


@login_required
@require_POST
def sync_facturas_ajax(request):
    """
    Sincroniza:
    - SOLO correos no leídos
    - SOLO del año actual
    """

    year_actual = now().year

    try:
        resultados = sync_facturas(
            year=year_actual,
            solo_unread=True
        )

        total_creadas = sum(r["creadas"] for r in resultados)

        return JsonResponse({
            "ok": True,
            "year": year_actual,
            "facturas_creadas": total_creadas,
        })

    except Exception as e:
        return JsonResponse({
            "ok": False,
            "error": str(e),
        }, status=500)