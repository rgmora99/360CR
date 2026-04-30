from rest_framework.exceptions import PermissionDenied

from apps.configuration.models import UserRoleAssignment
from apps.tenants.models import Membership, Organization, Subscription, SubscriptionModule


PERMISSION_MODULE_MAP = {
    "approvals.high": ["dashboard"],
    "customers.read": ["customers"],
    "customers.manage": ["customers"],
    "dashboards.executive": ["dashboard"],
    "invoices.manage": ["billing_basic"],
    "credit.manage": ["receivables"],
    "inventory.manage": ["inventory"],
    "operations.kpi": ["dashboard", "inventory"],
    "reports.finance": ["billing_basic", "receivables"],
    "reports.read": ["dashboard"],
    "suppliers.manage": ["suppliers", "purchases"],
    "suppliers.read": ["suppliers"],
    "tickets.manage": ["dashboard"],
    "users.lock": ["multiuser_permissions"],
    "users.read": ["multiuser_permissions"],
    "users.update": ["multiuser_permissions"],
    "security.manage": ["multiuser_permissions"],
    "audit.read": ["audit"],
}


def get_module_codes_for_permissions(permissions):
    permission_set = set(permissions or [])
    if "*" in permission_set:
        return {"*"}

    module_codes = set()
    for permission in permission_set:
        module_codes.update(PERMISSION_MODULE_MAP.get(permission, []))
    return module_codes


def get_allowed_organization_ids(user):
    if not user.is_authenticated:
        return []
    if user.is_superuser or user.is_staff:
        return list(Organization.objects.values_list("id", flat=True))

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


def get_enabled_module_organization_ids(organization_ids, module_code):
    if not module_code or not organization_ids:
        return list(organization_ids or [])
    return list(
        SubscriptionModule.objects.filter(
            subscription__organization_id__in=organization_ids,
            subscription__is_active=True,
            subscription__status__in=[Subscription.STATUS_TRIAL, Subscription.STATUS_ACTIVE],
            is_enabled=True,
            module__code=module_code,
            module__is_active=True,
        ).values_list("subscription__organization_id", flat=True)
    )


def organization_has_enabled_module(organization_id, module_code):
    try:
        selected_id = int(organization_id)
    except (TypeError, ValueError):
        return False
    return selected_id in get_enabled_module_organization_ids([selected_id], module_code)


def user_has_module_access(user, organization_id, module_code):
    if not module_code:
        return True
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True

    membership = Membership.objects.filter(user=user, organization_id=organization_id).first()
    if not membership:
        return False
    if membership.role in [Membership.ROLE_OWNER, Membership.ROLE_ADMIN]:
        return True

    assignments = UserRoleAssignment.objects.filter(
        user=user,
        organization_id=organization_id,
        is_active=True,
    ).select_related("role")
    for assignment in assignments:
        module_codes = get_module_codes_for_permissions(assignment.role.default_permissions)
        if "*" in module_codes or module_code in module_codes:
            return True
    return False


class OrganizationScopedViewMixin:
    organization_lookup_field = "organization_id"
    tenant_access_paths = ()
    enforce_tenant_on_create = True
    enforce_tenant_on_update = True
    allow_tenant_reassignment = False
    required_module_code = None

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

        if self.required_module_code:
            allowed_ids = get_enabled_module_organization_ids(allowed_ids, self.required_module_code)
            allowed_ids = [
                organization_id
                for organization_id in allowed_ids
                if user_has_module_access(self.request.user, organization_id, self.required_module_code)
            ]
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
        if self.required_module_code and not organization_has_enabled_module(selected_id, self.required_module_code):
            raise PermissionDenied("El modulo requerido no esta activo para esta organizacion")
        if self.required_module_code and not user_has_module_access(self.request.user, selected_id, self.required_module_code):
            raise PermissionDenied("Su rol no tiene acceso a este modulo")
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
