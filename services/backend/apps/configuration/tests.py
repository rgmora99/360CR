from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from apps.configuration.models import OrganizationEmailInbox
from apps.tenants.models import Membership, Organization, SaaSModule, Subscription, SubscriptionModule


class OrganizationEmailInboxValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="owner", password="pass")
        self.organization = Organization.objects.create(name="Org Config", slug="org-config")
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.ROLE_OWNER)
        subscription = Subscription.objects.create(organization=self.organization, status=Subscription.STATUS_TRIAL)
        module, _ = SaaSModule.objects.get_or_create(code="purchases", defaults={"name": "Compras"})
        SubscriptionModule.objects.create(subscription=subscription, module=module, is_enabled=True)
        self.client.force_authenticate(self.user)

    def payload(self, **overrides):
        data = {
            "organization": self.organization.id,
            "label": "Principal",
            "email": "compras@example.com",
            "username": "compras@example.com",
            "password": "secret",
            "imap_host": "imap.example.com",
            "imap_port": 993,
            "imap_ssl": True,
            "folder": "INBOX",
            "is_primary": False,
            "is_active": True,
        }
        data.update(overrides)
        return data

    def test_rejects_imap_port_above_tcp_range(self):
        response = self.client.post(
            "/api/config/email-inboxes/",
            self.payload(imap_port=999999),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("imap_port", response.data)
        self.assertEqual(OrganizationEmailInbox.objects.count(), 0)

    def test_database_rejects_imap_port_above_tcp_range(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OrganizationEmailInbox.objects.create(
                    organization=self.organization,
                    label="Principal",
                    email="compras@example.com",
                    username="compras@example.com",
                    password="secret",
                    imap_host="imap.example.com",
                    imap_port=999999,
                )
