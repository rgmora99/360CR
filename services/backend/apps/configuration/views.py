from django.contrib.auth.models import User
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.configuration.models import RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.configuration.serializers import (
    ConfigurationUserSerializer,
    RoleCatalogSerializer,
    SystemSettingSerializer,
    UserPreferenceSerializer,
    UserRoleAssignmentSerializer,
)
from apps.tenants.access import OrganizationScopedViewMixin


class ConfigurationUserViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = ConfigurationUserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        allowed_ids = self.get_allowed_organization_ids()
        return (
            User.objects.filter(membership__organization_id__in=allowed_ids)
            .distinct()
            .order_by("id")
        )

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("resolved_organization")
        if organization:
            self.validate_organization_payload(organization.id)
        serializer.save()


# Compatibilidad retroactiva:
# algunas versiones del contenedor importan OrganizationCollaboratorView desde urls.py.
# Mantener este alias evita fallos de importación sin romper la API actual.
class OrganizationCollaboratorView(ConfigurationUserViewSet):
    pass


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
