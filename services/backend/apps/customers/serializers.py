from rest_framework import serializers
from django.utils.text import slugify

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.tenants.models import Organization


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
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
        }

    def create(self, validated_data):
        if not validated_data.get("code"):
            organization = validated_data["organization"]
            next_number = 1
            existing_codes = Customer.objects.filter(organization=organization).values_list("code", flat=True)
            for item in existing_codes:
                digits = "".join(ch for ch in (item or "") if ch.isdigit())
                if digits:
                    next_number = max(next_number, int(digits) + 1)

            candidate = f"C{next_number:06d}"
            while Customer.objects.filter(organization=organization, code=candidate).exists():
                next_number += 1
                candidate = f"C{next_number:06d}"

            validated_data["code"] = candidate
        return super().create(validated_data)


class OrganizationSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)

    class Meta:
        model = Organization
        fields = ["id", "name", "slug"]
        extra_kwargs = {
            "name": {"required": True},
        }

    def validate_name(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("El nombre de la organización es obligatorio.")
        return cleaned

    def create(self, validated_data):
        name = validated_data.get("name", "").strip()
        slug = (validated_data.get("slug") or "").strip()

        if not slug and name:
            base_slug = slugify(name) or "organizacion"
            slug = base_slug
            suffix = 1
            while Organization.objects.filter(slug=slug).exists():
                suffix += 1
                slug = f"{base_slug}-{suffix}"

        validated_data["slug"] = slug
        return super().create(validated_data)


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
