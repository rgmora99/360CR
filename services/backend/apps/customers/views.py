from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.customers.serializers import (
    CustomerAddressSerializer,
    CustomerContactSerializer,
    CustomerSerializer,
    CustomerTypeSerializer,
    OrganizationSerializer,
)
from apps.tenants.models import Organization
from apps.tenants.access import OrganizationScopedViewMixin


class CustomerTypeViewSet(viewsets.ModelViewSet):
    queryset = CustomerType.objects.all()
    serializer_class = CustomerTypeSerializer
    permission_classes = [IsAuthenticated]


class CustomerViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Customer.objects.select_related("organization", "customer_type").all()
        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()


class OrganizationViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Organization.objects.all().order_by("id").filter(id__in=self.get_allowed_organization_ids())

    def perform_create(self, serializer):
        serializer.save()


class CustomerContactViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "customer__organization_id"
    serializer_class = CustomerContactSerializer
    permission_classes = [IsAuthenticated]

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

    def get_queryset(self):
        queryset = CustomerAddress.objects.select_related("customer").all()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return self.scope_queryset(queryset)
