from rest_framework.routers import DefaultRouter

from apps.finance.views import InvoiceViewSet, ProductViewSet, PurchaseViewSet, TaxQuarterReportViewSet

router = DefaultRouter()
router.register(r"products", ProductViewSet, basename="product")
router.register(r"invoices", InvoiceViewSet, basename="invoice")
router.register(r"purchases", PurchaseViewSet, basename="purchase")
router.register(r"tax-reports", TaxQuarterReportViewSet, basename="tax-report")

urlpatterns = router.urls
