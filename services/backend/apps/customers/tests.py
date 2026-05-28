from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerType
from apps.tenants.models import Membership, Organization, SaaSModule, Subscription, SubscriptionModule


class CustomerValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="owner", password="pass")
        self.organization = Organization.objects.create(name="Org Clientes", slug="org-clientes")
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.ROLE_OWNER)
        subscription = Subscription.objects.create(organization=self.organization, status=Subscription.STATUS_TRIAL)
        module, _ = SaaSModule.objects.get_or_create(code="customers", defaults={"name": "Clientes"})
        SubscriptionModule.objects.create(subscription=subscription, module=module, is_enabled=True)
        self.physical_type = CustomerType.objects.create(code="fisico", name="Persona fisica")
        self.legal_type = CustomerType.objects.create(code="juridico", name="Persona juridica")
        self.client.force_authenticate(self.user)

    def payload(self, **overrides):
        data = {
            "organization": self.organization.id,
            "customer_type": self.physical_type.id,
            "legal_name": "Maria Solis Mora",
            "tax_id": "1-2345-6789",
            "status": Customer.STATUS_ACTIVE,
            "email": "",
            "phone": "",
            "credit_approved": False,
            "credit_limit": 0,
            "payment_terms_days": 0,
            "notes": "",
        }
        data.update(overrides)
        return data

    def test_rejects_physical_customer_with_invalid_tax_id_and_incomplete_name(self):
        response = self.client.post(
            "/api/customers/",
            self.payload(tax_id="1175805", legal_name="2"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tax_id", response.data)
        self.assertIn("legal_name", response.data)
        self.assertEqual(Customer.objects.count(), 0)

    def test_normalizes_valid_physical_customer_tax_id(self):
        response = self.client.post("/api/customers/", self.payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get()
        self.assertEqual(customer.tax_id, "123456789")
        self.assertEqual(customer.legal_name, "Maria Solis Mora")

    def test_rejects_negative_credit_limit(self):
        response = self.client.post("/api/customers/", self.payload(credit_limit="-1.00"), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("credit_limit", response.data)
        self.assertEqual(Customer.objects.count(), 0)

    def test_rejects_empty_code_on_update(self):
        create_response = self.client.post("/api/customers/", self.payload(), format="json")
        self.assertEqual(create_response.status_code, 201, create_response.data)
        customer = Customer.objects.get()

        response = self.client.patch(
            f"/api/customers/{customer.id}/",
            {"code": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("code", response.data)
        customer.refresh_from_db()
        self.assertEqual(customer.code, "C000001")

    def test_rejects_legal_customer_with_invalid_tax_id_length_before_hacienda_lookup(self):
        response = self.client.post(
            "/api/customers/",
            self.payload(customer_type=self.legal_type.id, tax_id="123", legal_name="Empresa Demo"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tax_id", response.data)
        self.assertEqual(Customer.objects.count(), 0)

    def test_rejects_legal_customer_not_found_in_hacienda(self):
        with patch("apps.customers.serializers.lookup_hacienda_taxpayer", return_value=None):
            response = self.client.post(
                "/api/customers/",
                self.payload(customer_type=self.legal_type.id, tax_id="3101000000", legal_name="Empresa Demo"),
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("tax_id", response.data)
        self.assertEqual(Customer.objects.count(), 0)
