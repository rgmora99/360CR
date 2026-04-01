from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.customers.views import (
    CustomerAddressViewSet,
    CustomerContactViewSet,
    CustomerTypeViewSet,
    CustomerViewSet,
)

router = DefaultRouter()
router.register(r"customer-types", CustomerTypeViewSet, basename="customer-type")
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"customer-contacts", CustomerContactViewSet, basename="customer-contact")
router.register(r"customer-addresses", CustomerAddressViewSet, basename="customer-address")

urlpatterns = [
    path("", include(router.urls)),
]
