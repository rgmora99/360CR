from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerContact, CustomerType
from apps.loyalty.models import LoyaltyMember, LoyaltyProgram, LoyaltyTier
from apps.tenants.models import Membership, Organization


class TenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="owner@example.com", email="owner@example.com", password="testpass123")
        self.organization = Organization.objects.create(
            name="Org A",
            slug="org-a",
            hacienda_branch_code="001",
            hacienda_terminal_code="00001",
        )
        self.foreign_organization = Organization.objects.create(
            name="Org B",
            slug="org-b",
            hacienda_branch_code="001",
            hacienda_terminal_code="00002",
        )
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.ROLE_OWNER)
        self.client.force_authenticate(user=self.user)

        self.customer_type = CustomerType.objects.create(code="general", name="General")
        self.customer = Customer.objects.create(
            organization=self.organization,
            customer_type=self.customer_type,
            code="C000001",
            legal_name="Cliente A",
            tax_id="111",
        )
        self.foreign_customer = Customer.objects.create(
            organization=self.foreign_organization,
            customer_type=self.customer_type,
            code="C000002",
            legal_name="Cliente B",
            tax_id="222",
        )

    def test_customer_contact_creation_rejects_foreign_customer(self):
        response = self.client.post(
            "/api/customer-contacts/",
            {
                "customer": self.foreign_customer.id,
                "first_name": "Intruso",
                "last_name": "Tenant",
                "email": "intruso@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(CustomerContact.objects.count(), 0)

    def test_loyalty_member_creation_requires_program_and_customer_from_same_organization(self):
        program = LoyaltyProgram.objects.create(
            organization=self.organization,
            code="club-a",
            name="Club A",
        )
        foreign_program = LoyaltyProgram.objects.create(
            organization=self.foreign_organization,
            code="club-b",
            name="Club B",
        )
        tier = LoyaltyTier.objects.create(
            program=program,
            code="base",
            name="Base",
            rank=1,
            min_lifetime_points=0,
            multiplier="1.00",
        )

        response = self.client.post(
            "/api/loyalty-members/",
            {
                "program": foreign_program.id,
                "customer": self.customer.id,
                "tier": tier.id,
                "member_code": "MEM-001",
                "status": LoyaltyMember.STATUS_ACTIVE,
                "available_points": 0,
                "reserved_points": 0,
                "lifetime_points": 0,
            },
            format="json",
        )

        self.assertIn(response.status_code, {400, 403})
        self.assertEqual(LoyaltyMember.objects.count(), 0)
