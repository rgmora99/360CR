from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.tax_registry import lookup_hacienda_taxpayer, normalize_tax_id
from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.customers.serializers import (
    CustomerAddressSerializer,
    CustomerContactSerializer,
    CustomerSerializer,
    CustomerTypeSerializer,
    OrganizationSerializer,
    get_next_customer_code,
)
from apps.tenants.models import Membership, Organization
from apps.tenants.access import OrganizationScopedViewMixin


class CustomerTypeViewSet(viewsets.ModelViewSet):
    queryset = CustomerType.objects.all()
    serializer_class = CustomerTypeSerializer
    permission_classes = [IsAuthenticated]


class CustomerViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)
    required_module_code = "customers"

    def get_queryset(self):
        queryset = Customer.objects.select_related("organization", "customer_type").all()
        return self.scope_queryset(queryset)

    @action(detail=False, methods=["get"], url_path="next-code")
    def next_code(self, request):
        selected_id = self.validate_organization_payload(request.query_params.get("organization_id"))
        organization = Organization.objects.get(id=selected_id)
        return Response({"code": get_next_customer_code(organization)})

    @action(detail=False, methods=["get"], url_path="tax-registry")
    def tax_registry(self, request):
        tax_id = normalize_tax_id(request.query_params.get("tax_id"))
        if len(tax_id) != 10:
            return Response({"detail": "La cédula jurídica debe tener 10 dígitos."}, status=400)

        taxpayer = lookup_hacienda_taxpayer(tax_id)
        if not taxpayer:
            return Response({"detail": "No se encontró información tributaria para esa cédula jurídica."}, status=404)

        return Response(taxpayer)


class OrganizationViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    enforce_tenant_on_create = False
    enforce_tenant_on_update = False

    def get_queryset(self):
        return Organization.objects.all().order_by("id").filter(id__in=self.get_allowed_organization_ids())

    def perform_create(self, serializer):
        parent = serializer.validated_data.get("parent_organization")
        if parent and parent.id not in self.get_allowed_organization_ids():
            raise PermissionDenied("No tiene acceso a la organización padre seleccionada")

        organization = serializer.save()
        Membership.objects.get_or_create(
            user=self.request.user,
            organization=organization,
            defaults={"role": Membership.ROLE_OWNER},
        )


class CustomerContactViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "customer__organization_id"
    serializer_class = CustomerContactSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("customer.organization_id",)
    required_module_code = "customers"

    def get_queryset(self):
        queryset = CustomerContact.objects.select_related("customer").all()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return self.scope_queryset(queryset)


class CustomerAddressViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "customer__organization_id"
    serializer_class = CustomerAddressSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("customer.organization_id",)
    required_module_code = "customers"

    def get_queryset(self):
        queryset = CustomerAddress.objects.select_related("customer").all()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return self.scope_queryset(queryset)
