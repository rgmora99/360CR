from rest_framework.routers import DefaultRouter

from apps.finance.views import InvoiceViewSet, ProductViewSet

router = DefaultRouter()
router.register(r"products", ProductViewSet, basename="product")
router.register(r"invoices", InvoiceViewSet, basename="invoice")

urlpatterns = router.urls
