from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.configuration.models import RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.configuration.serializers import (
    ConfigurationUserSerializer,
    RoleCatalogSerializer,
    SystemSettingSerializer,
    UserPreferenceSerializer,
    UserRoleAssignmentSerializer,
)
from apps.tenants.access import OrganizationScopedViewMixin
from apps.tenants.models import Membership, Subscription


PLAN_COLLABORATOR_LIMITS = {
    Subscription.PLAN_STARTER: 3,
    Subscription.PLAN_GROWTH: 15,
    Subscription.PLAN_PRO: None,
}


class ConfigurationUserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = ConfigurationUserSerializer
    permission_classes = [IsAuthenticated]


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

    def get_queryset(self):
        queryset = UserRoleAssignment.objects.select_related("user", "role", "organization").all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organization")
        if organization:
            self.validate_organization_payload(organization.id)
        serializer.save(assigned_by=self.request.user)


class OrganizationCollaboratorView(APIView, OrganizationScopedViewMixin):
    permission_classes = [IsAuthenticated]

    def _get_org_id(self, request):
        raw = request.query_params.get("organization_id") or request.data.get("organization_id")
        if not raw:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    def _build_summary(self, organization_id):
        subscription = Subscription.objects.filter(organization_id=organization_id).first()
        plan = subscription.plan if subscription else Subscription.PLAN_STARTER
        limit = PLAN_COLLABORATOR_LIMITS.get(plan)
        members = Membership.objects.select_related("user").filter(organization_id=organization_id).order_by("id")
        count = members.count()
        return {
            "organization_id": organization_id,
            "plan": plan,
            "max_collaborators": limit,
            "current_collaborators": count,
            "remaining_slots": None if limit is None else max(limit - count, 0),
            "collaborators": [
                {
                    "id": membership.id,
                    "user_id": membership.user_id,
                    "email": membership.user.email or membership.user.username,
                    "role": membership.role,
                }
                for membership in members
            ],
        }

    def get(self, request):
        organization_id = self._get_org_id(request)
        if not organization_id:
            return Response({"detail": "organization_id es requerido."}, status=400)

        self.validate_organization_payload(organization_id)
        return Response(self._build_summary(organization_id))

    @transaction.atomic
    def post(self, request):
        organization_id = self._get_org_id(request)
        if not organization_id:
            return Response({"detail": "organization_id es requerido."}, status=400)

        self.validate_organization_payload(organization_id)
        email = (request.data.get("email") or "").strip().lower()
        role = (request.data.get("role") or Membership.ROLE_VIEWER).strip()
        if role not in {item[0] for item in Membership.ROLE_CHOICES}:
            return Response({"detail": "Rol inválido. Use owner, admin o viewer."}, status=400)
        if not email or "@" not in email:
            return Response({"detail": "Debe indicar un correo válido."}, status=400)

        summary = self._build_summary(organization_id)
        limit = summary["max_collaborators"]
        if limit is not None and summary["current_collaborators"] >= limit:
            return Response(
                {
                    "detail": (
                        f"El plan {summary['plan']} permite hasta {limit} colaboradores por organización. "
                        "Actualiza el plan para agregar más cuentas."
                    )
                },
                status=400,
            )

        user, created = User.objects.get_or_create(
            username=email,
            defaults={"email": email, "is_active": True},
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])

        if Membership.objects.filter(user_id=user.id, organization_id=organization_id).exists():
            return Response({"detail": "Esta cuenta ya está asociada como colaborador."}, status=400)

        Membership.objects.create(user_id=user.id, organization_id=organization_id, role=role)
        return Response(self._build_summary(organization_id), status=status.HTTP_201_CREATED)
