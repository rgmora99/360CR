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
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
            "email": {
                "required": True,
                "allow_blank": False,
                "error_messages": {
                    "required": "El correo es obligatorio.",
                    "blank": "El correo es obligatorio.",
                },
            },
            "phone": {
                "required": True,
                "allow_blank": False,
                "error_messages": {
                    "required": "El teléfono es obligatorio.",
                    "blank": "El teléfono es obligatorio.",
                },
            },
        }

    def validate_email(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("El correo es obligatorio.")
        return cleaned

    def validate_phone(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("El teléfono es obligatorio.")
        return cleaned

    def create(self, validated_data):
        if not validated_data.get("code"):
            organization = validated_data["organization"]
            next_number = 1
            existing_codes = Supplier.objects.filter(organization=organization).values_list("code", flat=True)
            for item in existing_codes:
                digits = "".join(ch for ch in (item or "") if ch.isdigit())
                if digits:
                    next_number = max(next_number, int(digits) + 1)

            candidate = f"P{next_number:06d}"
            while Supplier.objects.filter(organization=organization, code=candidate).exists():
                next_number += 1
                candidate = f"P{next_number:06d}"

            validated_data["code"] = candidate
        return super().create(validated_data)


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
