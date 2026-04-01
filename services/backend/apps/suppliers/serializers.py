from rest_framework import serializers

from apps.suppliers.models import Supplier, SupplierAddress, SupplierContact, SupplierType


class SupplierTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierType
        fields = ["id", "code", "name"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "organization",
            "supplier_type",
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


class SupplierContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierContact
        fields = [
            "id",
            "supplier",
            "first_name",
            "last_name",
            "role",
            "email",
            "phone",
            "is_primary",
            "created_at",
        ]


class SupplierAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierAddress
        fields = [
            "id",
            "supplier",
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
