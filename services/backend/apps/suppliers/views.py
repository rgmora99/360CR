from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.tax_registry import lookup_hacienda_taxpayer, normalize_tax_id
from apps.suppliers.models import Supplier, SupplierAddress, SupplierContact, SupplierType
from apps.suppliers.serializers import (
    SupplierAddressSerializer,
    SupplierContactSerializer,
    SupplierSerializer,
    SupplierTypeSerializer,
    get_next_supplier_code,
)
from apps.tenants.models import Organization
from apps.tenants.access import OrganizationScopedViewMixin


class SupplierTypeViewSet(viewsets.ModelViewSet):
    queryset = SupplierType.objects.all()
    serializer_class = SupplierTypeSerializer
    permission_classes = [IsAuthenticated]


class SupplierViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)
    required_module_code = "suppliers"

    def get_queryset(self):
        queryset = Supplier.objects.select_related("organization", "supplier_type").all()
        return self.scope_queryset(queryset)

    @action(detail=False, methods=["get"], url_path="next-code")
    def next_code(self, request):
        selected_id = self.validate_organization_payload(request.query_params.get("organization_id"))
        organization = Organization.objects.get(id=selected_id)
        return Response({"code": get_next_supplier_code(organization)})

    @action(detail=False, methods=["get"], url_path="tax-registry")
    def tax_registry(self, request):
        tax_id = normalize_tax_id(request.query_params.get("tax_id"))
        if len(tax_id) != 10:
            return Response({"detail": "La cédula jurídica debe tener 10 dígitos."}, status=400)

        taxpayer = lookup_hacienda_taxpayer(tax_id)
        if not taxpayer:
            return Response({"detail": "No se encontró información tributaria para esa cédula jurídica."}, status=404)

        return Response(taxpayer)


class SupplierContactViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "supplier__organization_id"
    serializer_class = SupplierContactSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("supplier.organization_id",)
    required_module_code = "suppliers"

    def get_queryset(self):
        queryset = SupplierContact.objects.select_related("supplier").all()
        supplier_id = self.request.query_params.get("supplier_id")
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        return self.scope_queryset(queryset)


class SupplierAddressViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "supplier__organization_id"
    serializer_class = SupplierAddressSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("supplier.organization_id",)
    required_module_code = "suppliers"

    def get_queryset(self):
        queryset = SupplierAddress.objects.select_related("supplier").all()
        supplier_id = self.request.query_params.get("supplier_id")
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        return self.scope_queryset(queryset)
