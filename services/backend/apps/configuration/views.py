import imaplib

from django.contrib.auth.models import User
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.configuration.models import OrganizationEmailInbox, RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.configuration.serializers import (
    ConfigurationUserSerializer,
    RoleCatalogSerializer,
    SystemSettingSerializer,
    UserPreferenceSerializer,
    UserRoleAssignmentSerializer,
    OrganizationEmailInboxSerializer,
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

    def get_queryset(self):
        queryset = UserRoleAssignment.objects.select_related("user", "role", "organization").all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organization")
        if organization:
            self.validate_organization_payload(organization.id)
        serializer.save(assigned_by=self.request.user)


class OrganizationEmailInboxViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = OrganizationEmailInboxSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = OrganizationEmailInbox.objects.all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        organization = serializer.validated_data.get("organization")
        if organization:
            self.validate_organization_payload(organization.id)
        serializer.save()

    def perform_update(self, serializer):
        organization = serializer.validated_data.get("organization") or serializer.instance.organization
        if organization:
            self.validate_organization_payload(organization.id)
        serializer.save()

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
