from rest_framework import serializers
from django.utils.text import slugify

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.tenants.models import Membership, Organization


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


class OrganizationSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    parent_organization = serializers.PrimaryKeyRelatedField(queryset=Organization.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "parent_organization"]
        extra_kwargs = {
            "name": {"required": True},
        }

    def validate_name(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("El nombre de la organización es obligatorio.")
        return cleaned

    def validate_parent_organization(self, value):
        request = self.context.get("request")
        if value and request and request.user.is_authenticated:
            has_access = Membership.objects.filter(user=request.user, organization=value).exists()
            if not has_access:
                raise serializers.ValidationError("No puede asociar una organización principal que no le pertenece.")
        return value

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
        organization = super().create(validated_data)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            Membership.objects.get_or_create(
                user=request.user,
                organization=organization,
                defaults={"role": Membership.ROLE_OWNER},
            )
        return organization


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
