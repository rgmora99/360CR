from datetime import datetime, time, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agenda.models import AgendaEvent, AgendaEventType, CollaboratorAvailability
from apps.customers.models import Customer, CustomerType
from apps.finance.models import Product
from apps.tenants.models import Membership, Organization


class PublicSelfBookingSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Org Agenda",
            slug="org-agenda",
            hacienda_branch_code="001",
            hacienda_terminal_code="00010",
        )
        self.customer_type = CustomerType.objects.create(code="general-agenda", name="General Agenda")
        self.customer = Customer.objects.create(
            organization=self.organization,
            customer_type=self.customer_type,
            code="C000010",
            legal_name="Cliente Agenda",
            tax_id="123456789",
            email="cliente@example.com",
            phone="88888888",
        )
        self.collaborator = User.objects.create_user(
            username="agenda-collab@example.com",
            email="agenda-collab@example.com",
            password="testpass123",
            first_name="Laura",
            last_name="Campos",
        )
        Membership.objects.create(user=self.collaborator, organization=self.organization, role=Membership.ROLE_OWNER)
        self.event_type = AgendaEventType.objects.create(code="cita-publica", name="Cita pública")
        self.service = Product.objects.create(
            organization=self.organization,
            name="Corte",
            sku="SVC-001-000010",
            product_type=Product.TYPE_SERVICE,
            unit_price="25.00",
            cost_price="10.00",
            stock=0,
            service_duration_minutes=45,
        )
        tomorrow = timezone.localdate() + timedelta(days=1)
        CollaboratorAvailability.objects.create(
            organization=self.organization,
            collaborator=self.collaborator,
            weekday=(tomorrow.weekday() + 1) % 7,
            start_time=time(8, 0),
            end_time=time(18, 0),
            is_active=True,
        )
        starts_at = timezone.make_aware(datetime.combine(tomorrow, time(10, 0)))
        self.appointment = AgendaEvent.objects.create(
            organization=self.organization,
            event_type=self.event_type,
            service=self.service,
            collaborator=self.collaborator,
            customer=self.customer,
            title="Cita Cliente Agenda",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(minutes=45),
            status=AgendaEvent.STATUS_PENDING,
        )
        self.access_code = self.appointment.issue_public_access_code()
        self.appointment.save(update_fields=["public_access_code_hash", "updated_at"])

    def test_public_lookup_requires_reference_and_access_code(self):
        response = self.client.post(
            "/api/agenda-events/self-book-lookup/",
            {"reference": self.appointment.public_reference, "access_code": "INVALIDO"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_public_lookup_returns_sanitized_payload(self):
        response = self.client.post(
            "/api/agenda-events/self-book-lookup/",
            {"reference": self.appointment.public_reference, "access_code": self.access_code},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        appointment = response.json()["appointment"]
        self.assertEqual(appointment["reference"], self.appointment.public_reference)
        self.assertNotIn("customer", appointment)
        self.assertNotIn("email", str(appointment))
        self.assertEqual(appointment["collaborator_label"], "Laura Campos")

    def test_public_cancel_works_with_reference_and_access_code(self):
        response = self.client.post(
            "/api/agenda-events/self-book-cancel/",
            {"reference": self.appointment.public_reference, "access_code": self.access_code},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, AgendaEvent.STATUS_CANCELLED)
