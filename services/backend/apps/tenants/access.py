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

    # Incluye sucursales/hijas de manera recursiva para habilitar estructuras jerarquicas.
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
    tenant_access_paths = ()
    enforce_tenant_on_create = True
    enforce_tenant_on_update = True
    allow_tenant_reassignment = False

    def get_allowed_organization_ids(self):
        return get_allowed_organization_ids(self.request.user)

    def _coerce_organization_id(self, value):
        if value is None:
            return None
        if hasattr(value, "pk"):
            return int(value.pk)
        return int(value)

    def _resolve_path_value(self, source, path):
        if source is None or not path:
            return None

        current = source
        for segment in path.split("."):
            if current is None:
                return None
            if isinstance(current, dict):
                current = current.get(segment)
            else:
                current = getattr(current, segment, None)
        return current

    def _resolve_serializer_path(self, serializer, path):
        validated_value = self._resolve_path_value(getattr(serializer, "validated_data", {}), path)
        if validated_value is not None:
            return validated_value
        return self._resolve_path_value(getattr(serializer, "instance", None), path)

    def _iter_tenant_organization_ids(self, serializer):
        seen = set()
        for path in self.tenant_access_paths:
            raw_value = self._resolve_serializer_path(serializer, path)
            if raw_value is None:
                continue
            try:
                organization_id = self._coerce_organization_id(raw_value)
            except (TypeError, ValueError):
                raise PermissionDenied(f"{path} invalido")
            if organization_id in seen:
                continue
            seen.add(organization_id)
            yield path, organization_id

    def validate_serializer_tenant_access(self, serializer):
        resolved_ids = []
        for _path, organization_id in self._iter_tenant_organization_ids(serializer):
            self.validate_organization_payload(organization_id)
            resolved_ids.append(organization_id)
        return resolved_ids

    def validate_tenant_reassignment(self, serializer):
        if self.allow_tenant_reassignment or not getattr(serializer, "instance", None):
            return

        for path in self.tenant_access_paths:
            current_value = self._resolve_path_value(serializer.instance, path)
            next_value = self._resolve_serializer_path(serializer, path)
            if current_value is None or next_value is None:
                continue
            try:
                current_organization_id = self._coerce_organization_id(current_value)
                next_organization_id = self._coerce_organization_id(next_value)
            except (TypeError, ValueError):
                raise PermissionDenied(f"{path} invalido")
            if current_organization_id != next_organization_id:
                raise PermissionDenied("No se permite mover registros entre organizaciones")

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
                raise PermissionDenied("organization_id invalido")

            if selected_id not in allowed_ids:
                raise PermissionDenied("No tiene acceso a la organizacion solicitada")
            queryset = queryset.filter(**{self.organization_lookup_field: selected_id})

        return queryset

    def validate_organization_payload(self, organization_id):
        try:
            selected_id = int(organization_id)
        except (TypeError, ValueError):
            raise PermissionDenied("organization_id invalido")

        if selected_id not in self.get_allowed_organization_ids():
            raise PermissionDenied("No tiene acceso a la organizacion solicitada")
        return selected_id

    def perform_create(self, serializer):
        if self.enforce_tenant_on_create:
            self.validate_serializer_tenant_access(serializer)
        serializer.save()

    def perform_update(self, serializer):
        if self.enforce_tenant_on_update:
            self.validate_tenant_reassignment(serializer)
            self.validate_serializer_tenant_access(serializer)
        serializer.save()
