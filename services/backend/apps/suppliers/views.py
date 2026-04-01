from rest_framework import viewsets

from apps.suppliers.models import Supplier, SupplierAddress, SupplierContact, SupplierType
from apps.suppliers.serializers import (
    SupplierAddressSerializer,
    SupplierContactSerializer,
    SupplierSerializer,
    SupplierTypeSerializer,
)


class SupplierTypeViewSet(viewsets.ModelViewSet):
    queryset = SupplierType.objects.all()
    serializer_class = SupplierTypeSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer

    def get_queryset(self):
        queryset = Supplier.objects.select_related("organization", "supplier_type").all()
        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset


class SupplierContactViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierContactSerializer

    def get_queryset(self):
        queryset = SupplierContact.objects.select_related("supplier").all()
        supplier_id = self.request.query_params.get("supplier_id")
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(supplier__organization_id=organization_id)

        return queryset


class SupplierAddressViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierAddressSerializer

    def get_queryset(self):
        queryset = SupplierAddress.objects.select_related("supplier").all()
        supplier_id = self.request.query_params.get("supplier_id")
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)

        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(supplier__organization_id=organization_id)

        return queryset
