from rest_framework import viewsets

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.customers.serializers import (
    CustomerAddressSerializer,
    CustomerContactSerializer,
    CustomerSerializer,
    CustomerTypeSerializer,
    OrganizationSerializer,
)
from apps.tenants.models import Organization


class CustomerTypeViewSet(viewsets.ModelViewSet):
    queryset = CustomerType.objects.all()
    serializer_class = CustomerTypeSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        queryset = Customer.objects.select_related("organization", "customer_type").all()
        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Organization.objects.all().order_by("id")
    serializer_class = OrganizationSerializer


class CustomerContactViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerContactSerializer

    def get_queryset(self):
        queryset = CustomerContact.objects.select_related("customer").all()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(customer__organization_id=organization_id)

        return queryset


class CustomerAddressViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerAddressSerializer

    def get_queryset(self):
        queryset = CustomerAddress.objects.select_related("customer").all()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        organization_id = self.request.query_params.get("organization_id")
        if organization_id:
            queryset = queryset.filter(customer__organization_id=organization_id)

        return queryset
