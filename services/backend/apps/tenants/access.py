from rest_framework.exceptions import PermissionDenied

from apps.tenants.models import Membership, Organization


def get_allowed_organization_ids(user):
    if not user.is_authenticated:
        return []
    direct_ids = set(Membership.objects.filter(user=user).values_list("organization_id", flat=True))
    if not direct_ids:
        return []

    allowed_ids = set(direct_ids)
    pending_parents = set(direct_ids)

    # Incluye sucursales/hijas de manera recursiva para habilitar estructuras jerárquicas.
    while pending_parents:
        children = set(
            Organization.objects.filter(parent_organization_id__in=pending_parents).values_list("id", flat=True)
        ) - allowed_ids
        if not children:
            break
        allowed_ids.update(children)
        pending_parents = children

    return sorted(allowed_ids)


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
