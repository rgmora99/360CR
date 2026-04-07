from rest_framework.exceptions import PermissionDenied

from apps.tenants.models import Membership


def get_allowed_organization_ids(user):
    if not user.is_authenticated:
        return []
    return list(Membership.objects.filter(user=user).values_list("organization_id", flat=True))


class OrganizationScopedViewMixin:
    organization_lookup_field = "organization_id"

    def get_allowed_organization_ids(self):
        return get_allowed_organization_ids(self.request.user)

    def scope_queryset(self, queryset):
        allowed_ids = self.get_allowed_organization_ids()
        if not allowed_ids:
            return queryset.none()

        queryset = queryset.filter(**{f"{self.organization_lookup_field}__in": allowed_ids})
        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            try:
                selected_id = int(organization_id)
            except (TypeError, ValueError):
                raise PermissionDenied("organization_id inválido")

            if selected_id not in allowed_ids:
                raise PermissionDenied("No tiene acceso a la organización solicitada")
            queryset = queryset.filter(**{self.organization_lookup_field: selected_id})

        return queryset

    def validate_organization_payload(self, organization_id):
        if organization_id not in self.get_allowed_organization_ids():
            raise PermissionDenied("No tiene acceso a la organización solicitada")
