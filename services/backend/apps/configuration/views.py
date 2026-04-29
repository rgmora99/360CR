import imaplib

from django.contrib.auth.models import User
from django.db import transaction
from django.utils.text import slugify
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.configuration.models import OrganizationEmailInbox, RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.configuration.serializers import (
    ConfigurationUserSerializer,
    OrganizationEmailInboxSerializer,
    OrganizationFeatureFlagSerializer,
    RoleCatalogSerializer,
    SaaSModuleSerializer,
    SaaSPlanModuleSerializer,
    SaaSPlanSerializer,
    SubscriptionModuleSerializer,
    SubscriptionSerializer,
    SystemAdminMembershipSerializer,
    SystemAdminOrganizationSerializer,
    SystemAdminUserSerializer,
    SystemSettingSerializer,
    UserPreferenceSerializer,
    UserRoleAssignmentSerializer,
    sync_subscription_modules,
)
from apps.tenants.access import OrganizationScopedViewMixin
from apps.tenants.models import (
    Membership,
    Organization,
    OrganizationFeatureFlag,
    SaaSModule,
    SaaSPlan,
    SaaSPlanModule,
    Subscription,
    SubscriptionModule,
)


def build_unique_slug(name):
    base_slug = slugify(name) or "organizacion"
    slug = base_slug
    suffix = 2
    while Organization.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


class IsSystemOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))


class ConfigurationUserViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = ConfigurationUserSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("resolved_organization",)

    def get_queryset(self):
        allowed_ids = self.get_allowed_organization_ids()
        queryset = User.objects.filter(membership__organization_id__in=allowed_ids).distinct().order_by("id")
        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            try:
                selected_id = int(organization_id)
            except (TypeError, ValueError):
                return queryset.none()
            if selected_id not in allowed_ids:
                return queryset.none()
            queryset = queryset.filter(membership__organization_id=selected_id)
        return queryset


class OrganizationCollaboratorView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return ConfigurationUserViewSet.as_view({"get": "list"})(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return ConfigurationUserViewSet.as_view({"post": "create"})(request, *args, **kwargs)


class RoleCatalogViewSet(viewsets.ModelViewSet):
    queryset = RoleCatalog.objects.all()
    serializer_class = RoleCatalogSerializer
    permission_classes = [IsAuthenticated]


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [IsAuthenticated]


class UserPreferenceViewSet(viewsets.ModelViewSet):
    queryset = UserPreference.objects.select_related("user").all()
    serializer_class = UserPreferenceSerializer
    permission_classes = [IsAuthenticated]


class UserRoleAssignmentViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = UserRoleAssignmentSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)

    def get_queryset(self):
        queryset = UserRoleAssignment.objects.select_related("user", "role", "organization").all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        self.validate_serializer_tenant_access(serializer)
        serializer.save(assigned_by=self.request.user)


class OrganizationEmailInboxViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = OrganizationEmailInboxSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)
    required_module_code = "purchases"

    def get_queryset(self):
        queryset = OrganizationEmailInbox.objects.all()
        return self.scope_queryset(queryset)

    @action(detail=False, methods=["post"], url_path="test-connection")
    def test_connection(self, request):
        payload_data = request.data.copy()
        instance = None
        inbox_id = payload_data.get("id")
        if inbox_id:
            instance = self.get_queryset().filter(id=inbox_id).first()
            if not instance:
                return Response({"ok": False, "detail": "No se encontró la conexión de correo a editar."}, status=404)
            payload_data.pop("id", None)

        serializer = self.get_serializer(instance=instance, data=payload_data, partial=bool(instance))
        serializer.is_valid(raise_exception=True)

        organization = serializer.validated_data.get("organization") or getattr(instance, "organization", None)
        if organization:
            self.validate_organization_payload(organization.id)

        payload = serializer.validated_data
        if instance and not payload.get("password"):
            payload["password"] = instance.password

        folder = payload.get("folder") or "INBOX"
        connection_class = imaplib.IMAP4_SSL if payload.get("imap_ssl", True) else imaplib.IMAP4

        mailbox = None
        try:
            mailbox = connection_class(payload["imap_host"], payload["imap_port"])
            mailbox.login(payload["username"], payload["password"])
            status_code, _ = mailbox.select(folder)
            if status_code != "OK":
                return Response(
                    {
                        "ok": False,
                        "detail": f"No fue posible abrir la carpeta {folder}. Verifica el nombre exacto de la carpeta.",
                    },
                    status=400,
                )

            return Response(
                {
                    "ok": True,
                    "detail": f"Conexión IMAP exitosa con {payload['imap_host']}:{payload['imap_port']} en la carpeta {folder}.",
                }
            )
        except imaplib.IMAP4.error as exc:
            return Response({"ok": False, "detail": f"Autenticación IMAP fallida: {exc}"}, status=400)
        except Exception as exc:
            return Response({"ok": False, "detail": f"No fue posible conectar al servidor IMAP: {exc}"}, status=400)
        finally:
            if mailbox is not None:
                try:
                    mailbox.close()
                except Exception:
                    pass
                try:
                    mailbox.logout()
                except Exception:
                    pass


class SystemAdminOverviewView(APIView):
    permission_classes = [IsSystemOwner]

    def get(self, request):
        organizations = Organization.objects.count()
        subscriptions = Subscription.objects.count()
        active_subscriptions = Subscription.objects.filter(status__in=[Subscription.STATUS_TRIAL, Subscription.STATUS_ACTIVE]).count()
        users = User.objects.count()
        modules = SaaSModule.objects.filter(is_active=True).count()
        plans = SaaSPlan.objects.filter(is_active=True).count()
        memberships = Membership.objects.count()
        flags = OrganizationFeatureFlag.objects.count()

        return Response(
            {
                "summary": {
                    "organizations": organizations,
                    "subscriptions": subscriptions,
                    "active_subscriptions": active_subscriptions,
                    "users": users,
                    "memberships": memberships,
                    "modules": modules,
                    "plans": plans,
                    "feature_flags": flags,
                }
            }
        )


class SystemAdminUserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = SystemAdminUserSerializer
    permission_classes = [IsSystemOwner]


class SystemAdminMembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.select_related("user", "organization").all().order_by("organization__name", "user__email")
    serializer_class = SystemAdminMembershipSerializer
    permission_classes = [IsSystemOwner]


class SystemAdminOrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.select_related("parent_organization").order_by("name")
    serializer_class = SystemAdminOrganizationSerializer
    permission_classes = [IsSystemOwner]

    def perform_create(self, serializer):
        name = serializer.validated_data["name"]
        organization = serializer.save(slug=serializer.validated_data.get("slug") or build_unique_slug(name))
        base_plan = SaaSPlan.objects.filter(code="base", is_active=True).first()
        subscription, _ = Subscription.objects.get_or_create(
            organization=organization,
            defaults={
                "plan": Subscription.PLAN_STARTER,
                "plan_catalog": base_plan,
                "status": Subscription.STATUS_TRIAL,
                "billing_cycle": Subscription.BILLING_MONTHLY,
                "base_price": getattr(base_plan, "monthly_price", 0) or 0,
            },
        )
        sync_subscription_modules(subscription)


class SaaSModuleViewSet(viewsets.ModelViewSet):
    queryset = SaaSModule.objects.all().order_by("group", "sort_order", "name")
    serializer_class = SaaSModuleSerializer
    permission_classes = [IsSystemOwner]


class SaaSPlanViewSet(viewsets.ModelViewSet):
    queryset = SaaSPlan.objects.prefetch_related("plan_modules__module").all().order_by("sort_order", "name")
    serializer_class = SaaSPlanSerializer
    permission_classes = [IsSystemOwner]


class SaaSPlanModuleViewSet(viewsets.ModelViewSet):
    queryset = SaaSPlanModule.objects.select_related("plan", "module").all().order_by("plan__sort_order", "sort_order", "module__name")
    serializer_class = SaaSPlanModuleSerializer
    permission_classes = [IsSystemOwner]


class SubscriptionViewSet(viewsets.ModelViewSet):
    queryset = Subscription.objects.select_related("organization", "plan_catalog").prefetch_related("subscription_modules__module").all().order_by("organization__name")
    serializer_class = SubscriptionSerializer
    permission_classes = [IsSystemOwner]

    def perform_create(self, serializer):
        with transaction.atomic():
            subscription = serializer.save()
            if subscription.plan_catalog_id and not subscription.base_price:
                subscription.base_price = (
                    subscription.plan_catalog.annual_price
                    if subscription.billing_cycle == Subscription.BILLING_ANNUAL
                    else subscription.plan_catalog.monthly_price
                )
                subscription.save(update_fields=["base_price"])


class SubscriptionModuleViewSet(viewsets.ModelViewSet):
    queryset = SubscriptionModule.objects.select_related("subscription", "module").all().order_by("subscription__organization__name", "module__group", "module__name")
    serializer_class = SubscriptionModuleSerializer
    permission_classes = [IsSystemOwner]


class OrganizationFeatureFlagViewSet(viewsets.ModelViewSet):
    queryset = OrganizationFeatureFlag.objects.select_related("organization", "module").all().order_by("organization__name", "key")
    serializer_class = OrganizationFeatureFlagSerializer
    permission_classes = [IsSystemOwner]
