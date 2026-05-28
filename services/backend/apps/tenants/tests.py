from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.customers.models import Customer, CustomerContact, CustomerType
from apps.loyalty.models import LoyaltyMember, LoyaltyProgram, LoyaltyTier
from apps.configuration.models import RoleCatalog, UserRoleAssignment
from apps.tenants.catalog import DEFAULT_SAAS_PLANS, ensure_default_saas_catalog
from apps.tenants.access import get_allowed_organization_ids, user_has_module_access
from apps.tenants.models import Membership, Organization, SaaSModule, SaaSPlan, Subscription, SubscriptionModule


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


class SaaSCatalogTests(TestCase):
    def test_default_catalog_assigns_modules_to_each_plan_and_syncs_subscription(self):
        ensure_default_saas_catalog()

        for code, _name, _description, _monthly, _annual, _sort_order, module_codes in DEFAULT_SAAS_PLANS:
            plan = SaaSPlan.objects.get(code=code)
            linked_codes = set(plan.plan_modules.filter(is_included=True).values_list("module__code", flat=True))
            self.assertEqual(linked_codes, set(module_codes))

        organization = Organization.objects.create(
            name="Org Catalogo",
            slug="org-catalogo",
            hacienda_branch_code="010",
            hacienda_terminal_code="00010",
        )
        plan = SaaSPlan.objects.get(code="finance")
        subscription = Subscription.objects.create(
            organization=organization,
            plan_catalog=plan,
            status=Subscription.STATUS_TRIAL,
            billing_cycle=Subscription.BILLING_MONTHLY,
            base_price=plan.monthly_price,
        )

        from apps.configuration.serializers import sync_subscription_modules

        sync_subscription_modules(subscription)
        synced_codes = set(SubscriptionModule.objects.filter(subscription=subscription).values_list("module__code", flat=True))
        self.assertEqual(synced_codes, {"receivables", "credit", "reports", "closures"})


class TenantRolePolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.system_owner = User.objects.create_superuser(
            username="system@example.com",
            email="system@example.com",
            password="testpass123",
        )
        self.staff_user = User.objects.create_user(
            username="staff@example.com",
            email="staff@example.com",
            password="testpass123",
            is_staff=True,
        )
        self.owner_user = User.objects.create_user(username="owner-policy@example.com", password="testpass123")
        self.admin_user = User.objects.create_user(username="admin-policy@example.com", password="testpass123")
        self.viewer_user = User.objects.create_user(username="viewer-policy@example.com", password="testpass123")
        self.other_owner = User.objects.create_user(username="other-owner@example.com", password="testpass123")
        self.organization = Organization.objects.create(
            name="Org Politicas",
            slug="org-politicas",
            hacienda_branch_code="020",
            hacienda_terminal_code="00020",
        )
        self.foreign_organization = Organization.objects.create(
            name="Org Ajena Politicas",
            slug="org-ajena-politicas",
            hacienda_branch_code="021",
            hacienda_terminal_code="00021",
        )
        self.subscription = Subscription.objects.create(
            organization=self.organization,
            status=Subscription.STATUS_TRIAL,
        )
        for code in ("billing_basic", "customers"):
            module, _ = SaaSModule.objects.get_or_create(code=code, defaults={"name": code})
            SubscriptionModule.objects.create(subscription=self.subscription, module=module, is_enabled=True)
        self.owner_membership = Membership.objects.create(
            user=self.owner_user,
            organization=self.organization,
            role=Membership.ROLE_OWNER,
        )
        self.admin_membership = Membership.objects.create(
            user=self.admin_user,
            organization=self.organization,
            role=Membership.ROLE_ADMIN,
        )
        self.viewer_membership = Membership.objects.create(
            user=self.viewer_user,
            organization=self.organization,
            role=Membership.ROLE_VIEWER,
        )

    def test_staff_without_membership_does_not_get_global_tenant_access(self):
        self.assertEqual(get_allowed_organization_ids(self.staff_user), [])
        self.assertFalse(user_has_module_access(self.staff_user, self.organization.id, "billing_basic"))

    def test_owner_and_admin_can_access_active_subscription_modules(self):
        self.assertTrue(user_has_module_access(self.owner_user, self.organization.id, "billing_basic"))
        self.assertTrue(user_has_module_access(self.admin_user, self.organization.id, "billing_basic"))

    def test_viewer_requires_granular_role_for_module_access(self):
        self.assertFalse(user_has_module_access(self.viewer_user, self.organization.id, "billing_basic"))
        role = RoleCatalog.objects.create(
            code="caja-politicas",
            name="Caja Politicas",
            persona=RoleCatalog.PERSONA_BUSINESS_MANAGER,
            description="Facturacion",
            typical_scenarios="Facturar",
            default_permissions=["invoices.manage"],
        )
        UserRoleAssignment.objects.create(
            user=self.viewer_user,
            organization=self.organization,
            role=role,
        )

        self.assertTrue(user_has_module_access(self.viewer_user, self.organization.id, "billing_basic"))
        self.assertFalse(user_has_module_access(self.viewer_user, self.organization.id, "customers"))

    def test_cannot_demote_last_owner(self):
        self.client.force_authenticate(user=self.system_owner)

        response = self.client.patch(
            f"/api/system-admin/memberships/{self.owner_membership.id}/",
            {
                "user": self.owner_user.id,
                "organization": self.organization.id,
                "role": Membership.ROLE_ADMIN,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.owner_membership.refresh_from_db()
        self.assertEqual(self.owner_membership.role, Membership.ROLE_OWNER)

    def test_cannot_delete_last_owner(self):
        self.client.force_authenticate(user=self.system_owner)

        response = self.client.delete(f"/api/system-admin/memberships/{self.owner_membership.id}/")

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Membership.objects.filter(id=self.owner_membership.id).exists())

    def test_can_demote_or_delete_owner_when_another_owner_remains(self):
        Membership.objects.create(
            user=self.other_owner,
            organization=self.organization,
            role=Membership.ROLE_OWNER,
        )
        self.client.force_authenticate(user=self.system_owner)

        demote_response = self.client.patch(
            f"/api/system-admin/memberships/{self.owner_membership.id}/",
            {
                "user": self.owner_user.id,
                "organization": self.organization.id,
                "role": Membership.ROLE_ADMIN,
            },
            format="json",
        )
        self.assertEqual(demote_response.status_code, 200, demote_response.data)

        self.owner_membership.refresh_from_db()
        delete_response = self.client.delete(f"/api/system-admin/memberships/{self.owner_membership.id}/")
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(Membership.objects.filter(id=self.owner_membership.id).exists())

    def test_admin_cannot_manage_tenant_memberships_but_owner_can(self):
        self.client.force_authenticate(user=self.admin_user)
        admin_response = self.client.post(
            "/api/config/users/",
            {
                "username": "admin-created@example.com",
                "email": "admin-created@example.com",
                "first_name": "Admin",
                "last_name": "Created",
                "organization_id": self.organization.id,
                "membership_role": Membership.ROLE_VIEWER,
            },
            format="json",
        )
        self.assertEqual(admin_response.status_code, 403)

        self.client.force_authenticate(user=self.owner_user)
        owner_response = self.client.post(
            "/api/config/users/",
            {
                "username": "owner-created@example.com",
                "email": "owner-created@example.com",
                "first_name": "Owner",
                "last_name": "Created",
                "organization_id": self.organization.id,
                "membership_role": Membership.ROLE_VIEWER,
            },
            format="json",
        )
        self.assertEqual(owner_response.status_code, 201, owner_response.data)
