from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.configuration.models import OrganizationEmailInbox
from apps.customers.models import Customer, CustomerType
from apps.finance.models import Invoice, InvoiceAuditLog, InvoiceItem, Product, Purchase, PurchaseInboxInvoice
from apps.finance.views import _sync_email_invoices_for_organization
from apps.tenants.models import Membership, Organization, SaaSModule, Subscription, SubscriptionModule


class FinanceHardeningTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="owner", email="owner@example.com", password="pass")
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org",
            hacienda_branch_code="001",
            hacienda_terminal_code="00001",
        )
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.ROLE_OWNER)
        self.subscription = Subscription.objects.create(organization=self.organization, status=Subscription.STATUS_TRIAL)
        self.enable_module("billing_basic")
        self.enable_module("receivables")
        self.enable_module("purchases")
        self.enable_module("suppliers")
        self.customer_type = CustomerType.objects.create(code="person", name="Persona")
        self.customer = Customer.objects.create(
            organization=self.organization,
            customer_type=self.customer_type,
            code="C-001",
            legal_name="Cliente Prueba",
            tax_id="101010101",
            status=Customer.STATUS_ACTIVE,
        )
        self.product = Product.objects.create(
            organization=self.organization,
            sku="P-001",
            product_type=Product.TYPE_PHYSICAL,
            name="Producto Fisico",
            unit_price=Decimal("100.00"),
            cost_price=Decimal("50.00"),
            tax_rate=Decimal("13.00"),
            stock=5,
            is_active=True,
        )
        self.client.force_authenticate(self.user)

    def enable_module(self, code):
        module, _ = SaaSModule.objects.get_or_create(code=code, defaults={"name": code})
        SubscriptionModule.objects.get_or_create(subscription=self.subscription, module=module, defaults={"is_enabled": True})

    def invoice_payload(self, quantity="2.000"):
        return {
            "organization": self.organization.id,
            "customer": self.customer.id,
            "document_type": Invoice.DOCUMENT_INVOICE,
            "sale_condition": "01",
            "payment_method": Invoice.PAYMENT_CASH,
            "tax_regime": Invoice.REGIME_SIMPLIFIED,
            "currency": "CRC",
            "exchange_rate": "1.0000",
            "items": [{"product": self.product.id, "quantity": quantity, "unit_price": "100.00"}],
        }

    def product_payload(self, **overrides):
        data = {
            "organization": self.organization.id,
            "product_type": Product.TYPE_PHYSICAL,
            "name": "Producto Controlado",
            "description": "Producto con control de inventario",
            "physical_location": "Bodega",
            "supplier": None,
            "unit_price": "100.00",
            "cost_price": "50.00",
            "tax_rate": "13.00",
            "stock": 10,
            "reorder_level": 2,
            "item_status": Product.STATUS_OK,
            "is_active": True,
            "service_duration_minutes": 0,
        }
        data.update(overrides)
        return data

    def create_invoice_direct(self):
        return Invoice.objects.create(
            organization=self.organization,
            customer=self.customer,
            invoice_number="F-00100001010000000001",
            consecutive_number="00100001010000000001",
            document_type=Invoice.DOCUMENT_INVOICE,
            sale_condition="01",
            payment_method=Invoice.PAYMENT_CASH,
            tax_regime=Invoice.REGIME_SIMPLIFIED,
            currency="CRC",
            exchange_rate=Decimal("1.0000"),
            status=Invoice.STATUS_ISSUED,
            total=Decimal("100.00"),
        )

    def inbox_payload(self, numeric_key="1" * 50, invoice_number="FAC-001"):
        return {
            "organization": self.organization,
            "supplier_name": "Proveedor",
            "supplier_tax_id": "3101000000",
            "buyer_name": "Comprador",
            "buyer_tax_id": "3102000000",
            "issue_date": date(2026, 5, 1),
            "invoice_number": invoice_number,
            "numeric_key": numeric_key,
            "currency": "CRC",
            "exchange_rate": Decimal("1.0000"),
            "subtotal": Decimal("100.00"),
            "tax_total": Decimal("13.00"),
            "total": Decimal("113.00"),
            "status": PurchaseInboxInvoice.STATUS_PENDING,
            "payload": {
                "items": [{"description": "Linea", "unit_price": "100.00", "quantity": "1.000"}],
            },
        }

    def purchase_payload(self, **overrides):
        data = {
            "organization": self.organization.id,
            "supplier_name": "Proveedor",
            "supplier_tax_id": "3101000000",
            "buyer_name": "Comprador",
            "buyer_tax_id": "3102000000",
            "issue_date": "2026-05-01",
            "invoice_number": "FAC-001",
            "numeric_key": "1" * 50,
            "currency": "CRC",
            "exchange_rate": "1.0000",
            "tax_total": "13.00",
            "total": "113.00",
            "items": [{"description": "Linea", "unit_price": "100.00", "quantity": "1.000"}],
        }
        data.update(overrides)
        return data

    def approve_url(self, inbox):
        return f"/api/purchase-inbox/{inbox.id}/approve/?organization_id={self.organization.id}"

    def reject_url(self, inbox):
        return f"/api/purchase-inbox/{inbox.id}/reject/?organization_id={self.organization.id}"

    def test_invoice_creation_decrements_stock_once(self):
        response = self.client.post("/api/invoices/", self.invoice_payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(Invoice.objects.first().items.count(), 1)

    def test_invoice_creation_rejects_insufficient_stock_without_side_effects(self):
        response = self.client.post("/api/invoices/", self.invoice_payload(quantity="6.000"), format="json")

        self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 5)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_issued_invoice_rejects_patch_put_and_delete(self):
        invoice = self.create_invoice_direct()
        url = f"/api/invoices/{invoice.id}/?organization_id={self.organization.id}"

        self.assertEqual(self.client.patch(url, {"notes": "cambio"}, format="json").status_code, 405)
        self.assertEqual(self.client.put(url, {"notes": "cambio"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)
        self.assertTrue(Invoice.objects.filter(id=invoice.id).exists())

    def test_invoice_consecutive_retry_after_integrity_error(self):
        original_create = Invoice.objects.create
        calls = {"count": 0}

        def flaky_create(**kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                raise IntegrityError("duplicate consecutive")
            return original_create(**kwargs)

        with patch("apps.finance.serializers.Invoice.objects.create", side_effect=flaky_create):
            response = self.client.post("/api/invoices/", self.invoice_payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(calls["count"], 2)
        self.assertEqual(Invoice.objects.count(), 1)

    def test_invoice_consecutive_retry_exhaustion_returns_controlled_error(self):
        with patch("apps.finance.serializers.Invoice.objects.create", side_effect=IntegrityError("duplicate")):
            response = self.client.post("/api/invoices/", self.invoice_payload(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("invoice_number", response.data)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_purchase_inbox_approve_creates_purchase_and_registers(self):
        inbox = PurchaseInboxInvoice.objects.create(**self.inbox_payload())

        response = self.client.post(self.approve_url(inbox), {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        inbox.refresh_from_db()
        self.assertEqual(Purchase.objects.count(), 1)
        self.assertEqual(inbox.status, PurchaseInboxInvoice.STATUS_REGISTERED)
        self.assertIsNotNone(inbox.purchase_id)
        self.assertIsNotNone(inbox.processed_at)

    def test_purchase_rejects_unsupported_currency(self):
        response = self.client.post("/api/purchases/", self.purchase_payload(currency="EUR"), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("currency", response.data)
        self.assertEqual(Purchase.objects.count(), 0)

    def test_purchase_rejects_non_positive_exchange_rate(self):
        response = self.client.post("/api/purchases/", self.purchase_payload(exchange_rate="0.0000"), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("exchange_rate", response.data)
        self.assertEqual(Purchase.objects.count(), 0)

    def test_purchase_rejects_empty_supplier_or_buyer_identity(self):
        response = self.client.post(
            "/api/purchases/",
            self.purchase_payload(supplier_name="", supplier_tax_id="", buyer_name="", buyer_tax_id=""),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("supplier_name", response.data)
        self.assertIn("supplier_tax_id", response.data)
        self.assertIn("buyer_name", response.data)
        self.assertIn("buyer_tax_id", response.data)
        self.assertEqual(Purchase.objects.count(), 0)

    def test_purchase_rejects_unknown_supplier_or_buyer_identity(self):
        response = self.client.post(
            "/api/purchases/",
            self.purchase_payload(
                supplier_name="Proveedor desconocido",
                supplier_tax_id="No disponible",
                buyer_name="Comprador desconocido",
                buyer_tax_id="unknown",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("supplier_name", response.data)
        self.assertIn("supplier_tax_id", response.data)
        self.assertIn("buyer_name", response.data)
        self.assertIn("buyer_tax_id", response.data)
        self.assertEqual(Purchase.objects.count(), 0)

    def test_registered_purchase_inbox_cannot_be_approved_twice(self):
        inbox = PurchaseInboxInvoice.objects.create(**self.inbox_payload())
        first_response = self.client.post(self.approve_url(inbox), {}, format="json")
        self.assertEqual(first_response.status_code, 200, first_response.data)

        second_response = self.client.post(self.approve_url(inbox), {}, format="json")

        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(Purchase.objects.count(), 1)

    def test_registered_purchase_inbox_cannot_be_rejected(self):
        inbox = PurchaseInboxInvoice.objects.create(**self.inbox_payload())
        self.client.post(self.approve_url(inbox), {}, format="json")

        response = self.client.post(self.reject_url(inbox), {"reason": "duplicada"}, format="json")

        self.assertEqual(response.status_code, 400)
        inbox.refresh_from_db()
        self.assertEqual(inbox.status, PurchaseInboxInvoice.STATUS_REGISTERED)

    def test_sync_does_not_return_final_inbox_records_to_pending(self):
        OrganizationEmailInbox.objects.create(
            organization=self.organization,
            label="Principal",
            email="inbox@example.com",
            username="inbox@example.com",
            password="secret",
            is_active=True,
        )
        registered = PurchaseInboxInvoice.objects.create(
            **{
                **self.inbox_payload(numeric_key="2" * 50, invoice_number="OLD-R"),
                "status": PurchaseInboxInvoice.STATUS_REGISTERED,
                "payload": {"items": [{"description": "Original", "unit_price": "50.00", "quantity": "1.000"}]},
            }
        )
        rejected = PurchaseInboxInvoice.objects.create(
            **{
                **self.inbox_payload(numeric_key="3" * 50, invoice_number="OLD-X"),
                "status": PurchaseInboxInvoice.STATUS_REJECTED,
                "rejection_reason": "No aplica",
                "payload": {"items": [{"description": "Original", "unit_price": "50.00", "quantity": "1.000"}]},
            }
        )
        payloads = [
            {
                "numeric_key": registered.numeric_key,
                "invoice_number": "NEW-R",
                "supplier_name": "Proveedor Nuevo",
                "supplier_tax_id": "3101000001",
                "buyer_name": "Comprador Nuevo",
                "buyer_tax_id": "3102000001",
                "issue_date": date(2026, 5, 2),
                "items": [{"description": "Nueva", "unit_price": Decimal("200.00"), "quantity": Decimal("1.000")}],
                "subtotal": Decimal("200.00"),
                "tax_total": Decimal("26.00"),
                "total": Decimal("226.00"),
                "currency": "CRC",
                "exchange_rate": Decimal("1.0000"),
            },
            {
                "numeric_key": rejected.numeric_key,
                "invoice_number": "NEW-X",
                "supplier_name": "Proveedor Nuevo",
                "supplier_tax_id": "3101000001",
                "buyer_name": "Comprador Nuevo",
                "buyer_tax_id": "3102000001",
                "issue_date": date(2026, 5, 2),
                "items": [{"description": "Nueva", "unit_price": Decimal("200.00"), "quantity": Decimal("1.000")}],
                "subtotal": Decimal("200.00"),
                "tax_total": Decimal("26.00"),
                "total": Decimal("226.00"),
                "currency": "CRC",
                "exchange_rate": Decimal("1.0000"),
            },
        ]

        with patch("apps.finance.views._fetch_email_invoice_payloads", return_value=(payloads, [], 0, 0, 2, 2)):
            result = _sync_email_invoices_for_organization(self.organization.id, date(2026, 5, 1), date(2026, 5, 31))

        self.assertEqual(result["updated"], 0)
        registered.refresh_from_db()
        rejected.refresh_from_db()
        self.assertEqual(registered.status, PurchaseInboxInvoice.STATUS_REGISTERED)
        self.assertEqual(registered.invoice_number, "OLD-R")
        self.assertEqual(rejected.status, PurchaseInboxInvoice.STATUS_REJECTED)
        self.assertEqual(rejected.invoice_number, "OLD-X")

    def test_product_rejects_cost_greater_than_sale_price(self):
        response = self.client.post(
            "/api/products/",
            self.product_payload(unit_price="100.00", cost_price="150.00"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cost_price", response.data)

    def test_product_rejects_raw_material_without_supplier(self):
        response = self.client.post(
            "/api/products/",
            self.product_payload(item_status=Product.STATUS_RAW_MATERIAL, supplier=None),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("supplier", response.data)

    def test_service_allows_no_duration_and_clears_inventory_fields(self):
        response = self.client.post(
            "/api/products/",
            self.product_payload(
                product_type=Product.TYPE_SERVICE,
                name="Servicio sin duracion",
                physical_location="Bodega",
                stock=10,
                reorder_level=3,
                item_status=Product.STATUS_DAMAGED,
                service_duration_minutes=0,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(id=response.data["id"])
        self.assertEqual(product.stock, 0)
        self.assertEqual(product.reorder_level, 0)
        self.assertEqual(product.physical_location, "")
        self.assertEqual(product.item_status, Product.STATUS_OK)

    def test_product_used_in_invoice_cannot_change_type(self):
        invoice = self.create_invoice_direct()
        InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product,
            line_number=1,
            description=self.product.name,
            quantity=Decimal("1.000"),
            unit_price=Decimal("100.00"),
            tax_rate=Decimal("0.00"),
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
        )

        response = self.client.patch(
            f"/api/products/{self.product.id}/?organization_id={self.organization.id}",
            {"product_type": Product.TYPE_SERVICE, "service_duration_minutes": 30},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("product_type", response.data)

    def test_product_used_in_invoice_cannot_be_deleted(self):
        invoice = self.create_invoice_direct()
        InvoiceItem.objects.create(
            invoice=invoice,
            product=self.product,
            line_number=1,
            description=self.product.name,
            quantity=Decimal("1.000"),
            unit_price=Decimal("100.00"),
            tax_rate=Decimal("0.00"),
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
        )

        response = self.client.delete(f"/api/products/{self.product.id}/?organization_id={self.organization.id}")

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())

    def test_void_invoice_requires_reason_creates_audit_and_restores_stock(self):
        response = self.client.post("/api/invoices/", self.invoice_payload(quantity="2.000"), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        invoice_id = response.data["id"]
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 3)

        void_response = self.client.post(
            f"/api/invoices/{invoice_id}/void/?organization_id={self.organization.id}",
            {"reason": "Factura emitida por error operativo"},
            format="json",
        )

        self.assertEqual(void_response.status_code, 200, void_response.data)
        invoice = Invoice.objects.get(id=invoice_id)
        self.product.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_VOID)
        self.assertEqual(self.product.stock, 5)
        self.assertTrue(InvoiceAuditLog.objects.filter(invoice=invoice, action=InvoiceAuditLog.ACTION_VOID).exists())

    def test_credit_note_is_linked_to_original_invoice(self):
        response = self.client.post("/api/invoices/", self.invoice_payload(quantity="1.000"), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        invoice_id = response.data["id"]

        note_response = self.client.post(
            f"/api/invoices/{invoice_id}/credit-note/?organization_id={self.organization.id}",
            {"reason": "Devolucion total de la venta"},
            format="json",
        )

        self.assertEqual(note_response.status_code, 201, note_response.data)
        credit_note = Invoice.objects.get(id=note_response.data["id"])
        self.assertEqual(credit_note.document_type, Invoice.DOCUMENT_CREDIT_NOTE)
        self.assertEqual(credit_note.original_invoice_id, invoice_id)
        self.assertEqual(credit_note.items.count(), 1)
        self.assertTrue(InvoiceAuditLog.objects.filter(invoice_id=invoice_id, action=InvoiceAuditLog.ACTION_CREDIT_NOTE).exists())

    def test_receivable_payment_marks_invoice_paid(self):
        invoice = self.create_invoice_direct()
        invoice.sale_condition = "02"
        invoice.payment_method = Invoice.PAYMENT_INSTALLMENTS
        invoice.installment_count = 1
        invoice.total = Decimal("100.00")
        invoice.save(update_fields=["sale_condition", "payment_method", "installment_count", "total"])

        response = self.client.post(
            f"/api/invoices/{invoice.id}/receivable-payments/?organization_id={self.organization.id}",
            {"amount": "100.00", "payment_date": date.today().isoformat(), "reference": "REC-1"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.STATUS_PAID)

    def test_overdue_alerts_and_sales_dashboard(self):
        invoice = self.create_invoice_direct()
        invoice.sale_condition = "02"
        invoice.payment_method = Invoice.PAYMENT_INSTALLMENTS
        invoice.installment_count = 1
        invoice.installment_interval_days = 1
        invoice.total = Decimal("100.00")
        invoice.save(update_fields=["sale_condition", "payment_method", "installment_count", "installment_interval_days", "total"])
        Invoice.objects.filter(id=invoice.id).update(issue_date="2026-01-01T08:00:00Z")

        alerts = self.client.get(f"/api/invoices/overdue-alerts/?organization_id={self.organization.id}")
        dashboard = self.client.get(f"/api/invoices/sales-dashboard/?organization_id={self.organization.id}&period=month")

        self.assertEqual(alerts.status_code, 200, alerts.data)
        self.assertEqual(alerts.data["count"], 1)
        self.assertEqual(dashboard.status_code, 200, dashboard.data)
        self.assertEqual(dashboard.data["invoice_count"], 1)
        self.assertEqual(len(dashboard.data["by_customer"]), 1)
