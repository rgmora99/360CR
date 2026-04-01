from rest_framework import serializers

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType


class CustomerTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerType
        fields = ["id", "code", "name"]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id",
            "organization",
            "customer_type",
            "code",
            "legal_name",
            "trade_name",
            "tax_id",
            "status",
            "email",
            "phone",
            "credit_limit",
            "payment_terms_days",
            "notes",
            "created_at",
            "updated_at",
        ]


class CustomerContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContact
        fields = [
            "id",
            "customer",
            "first_name",
            "last_name",
            "role",
            "email",
            "phone",
            "is_primary",
            "created_at",
        ]


class CustomerAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAddress
        fields = [
            "id",
            "customer",
            "address_type",
            "country",
            "state",
            "city",
            "postal_code",
            "address_line_1",
            "address_line_2",
            "is_primary",
            "created_at",
        ]
