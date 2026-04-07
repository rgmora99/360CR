from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def healthcheck(_request):
    return JsonResponse({"status": "ok", "service": "cr360-backend"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", healthcheck, name="healthcheck"),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.suppliers.urls")),
    path("api/", include("apps.finance.urls")),
    path("api/", include("apps.configuration.urls")),
]
