from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerType
from apps.loyalty.models import LoyaltyMember, LoyaltyProgram, LoyaltyReward, LoyaltyRule, LoyaltyTier
from apps.tenants.models import Membership, Organization, SaaSModule, Subscription, SubscriptionModule


class LoyaltyMemberValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="owner", password="pass")
        self.organization = Organization.objects.create(name="Org Loyalty", slug="org-loyalty")
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.ROLE_OWNER)
        subscription = Subscription.objects.create(organization=self.organization, status=Subscription.STATUS_TRIAL)
        module, _ = SaaSModule.objects.get_or_create(code="loyalty", defaults={"name": "Fidelizacion"})
        SubscriptionModule.objects.create(subscription=subscription, module=module, is_enabled=True)

        customer_type = CustomerType.objects.create(code="fisico", name="Persona fisica")
        self.customer = Customer.objects.create(
            organization=self.organization,
            customer_type=customer_type,
            code="C000001",
            legal_name="Cliente Loyalty",
            tax_id="123456789",
        )
        self.program = LoyaltyProgram.objects.create(organization=self.organization, code="club", name="Club")
        self.tier = LoyaltyTier.objects.create(program=self.program, code="base", name="Base", rank=1)
        self.client.force_authenticate(self.user)

    def payload(self, **overrides):
        data = {
            "program": self.program.id,
            "customer": self.customer.id,
            "tier": self.tier.id,
            "member_code": "MEM-001",
            "status": LoyaltyMember.STATUS_ACTIVE,
            "lifetime_points": 0,
            "available_points": 0,
            "reserved_points": 0,
        }
        data.update(overrides)
        return data

    def test_rejects_negative_available_points(self):
        response = self.client.post("/api/loyalty-members/", self.payload(available_points=-1), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("available_points", response.data)
        self.assertEqual(LoyaltyMember.objects.count(), 0)

    def test_database_rejects_negative_available_points(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                LoyaltyMember.objects.create(
                    program=self.program,
                    customer=self.customer,
                    tier=self.tier,
                    member_code="MEM-DB",
                    available_points=-1,
                )

    def test_rejects_program_end_date_before_start_date(self):
        response = self.client.post(
            "/api/loyalty-programs/",
            {
                "organization": self.organization.id,
                "code": "invalid-dates",
                "name": "Fechas invalidas",
                "start_date": "2026-05-10",
                "end_date": "2026-05-09",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("end_date", response.data)

    def test_rejects_rule_ends_at_before_starts_at(self):
        response = self.client.post(
            "/api/loyalty-rules/",
            {
                "program": self.program.id,
                "rule_type": LoyaltyRule.RULE_EARN,
                "name": "Regla fechas invalidas",
                "description": "",
                "points_per_currency_unit": "1.0000",
                "minimum_purchase_amount": "0.00",
                "minimum_points_to_redeem": 0,
                "is_active": True,
                "starts_at": "2026-05-10T10:00:00Z",
                "ends_at": "2026-05-10T09:00:00Z",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("ends_at", response.data)

    def test_rejects_reward_with_zero_points_cost(self):
        response = self.client.post(
            "/api/loyalty-rewards/",
            {
                "program": self.program.id,
                "code": "free-reward",
                "name": "Recompensa gratis",
                "description": "",
                "points_cost": 0,
                "stock": 10,
                "is_unlimited_stock": False,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("points_cost", response.data)
        self.assertEqual(LoyaltyReward.objects.count(), 0)

    def test_database_rejects_reward_with_zero_points_cost(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                LoyaltyReward.objects.create(
                    program=self.program,
                    code="free-db",
                    name="Recompensa gratis DB",
                    points_cost=0,
                    stock=10,
                )
