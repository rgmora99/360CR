from rest_framework import serializers
from django.db import IntegrityError
from django.utils import timezone
from django.utils.text import slugify

from apps.core.tax_registry import lookup_hacienda_taxpayer, normalize_tax_id
from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType
from apps.tenants.models import Organization


def _bool_from_yes_no(value):
    if value is None:
        return None
    normalized = str(value).strip().upper()
    if normalized == "SI":
        return True
    if normalized == "NO":
        return False
    return None


def get_next_customer_code(organization):
    next_number = 1
    existing_codes = Customer.objects.filter(organization=organization).values_list("code", flat=True)
    for item in existing_codes:
        raw_code = str(item or "").strip().upper()
        if not raw_code.startswith("C"):
            continue
        digits = raw_code[1:]
        if digits.isdigit():
            next_number = max(next_number, int(digits) + 1)

    candidate = f"C{next_number:06d}"
    while Customer.objects.filter(organization=organization, code=candidate).exists():
        next_number += 1
        candidate = f"C{next_number:06d}"
    return candidate


def enrich_party_with_hacienda(validated_data, instance=None, type_field_name="customer_type"):
    party_type = validated_data.get(type_field_name) or getattr(instance, type_field_name, None)
    tax_id = validated_data.get("tax_id", getattr(instance, "tax_id", ""))
    normalized_tax_id = normalize_tax_id(tax_id)

    if not party_type or party_type.code == "fisico" or len(normalized_tax_id) != 10:
        return validated_data

    taxpayer = lookup_hacienda_taxpayer(normalized_tax_id)
    if not taxpayer:
        return validated_data

    regime = taxpayer.get("regimen") or {}
    situation = taxpayer.get("situacion") or {}
    activities = taxpayer.get("actividades") or []

    validated_data["legal_name"] = taxpayer.get("nombre") or validated_data.get(
        "legal_name",
        getattr(instance, "legal_name", ""),
    )
    validated_data["tax_regime_code"] = str(regime.get("codigo") or "")
    validated_data["tax_regime_description"] = regime.get("descripcion") or ""
    validated_data["tax_status"] = situation.get("estado") or ""
    validated_data["tax_administration"] = situation.get("administracionTributaria") or ""
    validated_data["tax_is_delinquent"] = _bool_from_yes_no(situation.get("moroso"))
    validated_data["tax_is_omitted"] = _bool_from_yes_no(situation.get("omiso"))
    validated_data["tax_activities"] = [
        {
            "code": activity.get("codigo"),
            "type": activity.get("tipo"),
            "status": activity.get("estado"),
            "description": activity.get("descripcion"),
        }
        for activity in activities
    ]
    validated_data["tax_last_sync_at"] = timezone.now()
    return validated_data


class CustomerTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerType
        fields = ["id", "code", "name"]


class CustomerSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True)

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
            "tax_regime_code",
            "tax_regime_description",
            "tax_status",
            "tax_administration",
            "tax_is_delinquent",
            "tax_is_omitted",
            "tax_activities",
            "tax_last_sync_at",
            "credit_approved",
            "credit_limit",
            "payment_terms_days",
            "notes",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
        }
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        tax_id = (attrs.get("tax_id") if "tax_id" in attrs else getattr(self.instance, "tax_id", "")) or ""
        normalized_tax_id = tax_id.strip()

        if organization and normalized_tax_id:
            queryset = Customer.objects.filter(organization=organization, tax_id=normalized_tax_id)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({"tax_id": "Ya existe un cliente con esa cédula en esta organización."})

        return attrs

    def validate_email(self, value):
        return (value or "").strip()

    def validate_phone(self, value):
        return (value or "").strip()

    def create(self, validated_data):
        validated_data = enrich_party_with_hacienda(validated_data, type_field_name="customer_type")
        validated_data["code"] = get_next_customer_code(validated_data["organization"])
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            message = str(exc).lower()
            if "uq_customer_org_tax_id" in message:
                raise serializers.ValidationError({"tax_id": "Ya existe un cliente con esa cédula en esta organización."})
            if "uq_customer_org_code" in message:
                raise serializers.ValidationError({"code": "Ya existe un cliente con ese código en esta organización."})
            raise serializers.ValidationError("No se pudo guardar el cliente porque ya existe un registro duplicado.")

    def update(self, instance, validated_data):
        validated_data = enrich_party_with_hacienda(validated_data, instance=instance, type_field_name="customer_type")
        return super().update(instance, validated_data)


class OrganizationSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    parent_organization_name = serializers.CharField(source="parent_organization.name", read_only=True)

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "parent_organization",
            "parent_organization_name",
            "hacienda_branch_code",
            "hacienda_terminal_code",
            "is_active",
        ]
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
