from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.suppliers.views import (
    SupplierAddressViewSet,
    SupplierContactViewSet,
    SupplierTypeViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register(r"supplier-types", SupplierTypeViewSet, basename="supplier-type")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"supplier-contacts", SupplierContactViewSet, basename="supplier-contact")
router.register(r"supplier-addresses", SupplierAddressViewSet, basename="supplier-address")

urlpatterns = [
    path("", include(router.urls)),
]
