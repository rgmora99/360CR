from rest_framework import serializers
from django.db import IntegrityError
from django.utils import timezone

from apps.core.party_validation import PHYSICAL_TYPE_CODE, clean_party_identity
from apps.core.tax_registry import lookup_hacienda_taxpayer, normalize_tax_id
from apps.suppliers.models import Supplier, SupplierAddress, SupplierContact, SupplierType


def _bool_from_yes_no(value):
    if value is None:
        return None
    normalized = str(value).strip().upper()
    if normalized == "SI":
        return True
    if normalized == "NO":
        return False
    return None


def get_next_supplier_code(organization):
    next_number = 1
    existing_codes = Supplier.objects.filter(organization=organization).values_list("code", flat=True)
    for item in existing_codes:
        raw_code = str(item or "").strip().upper()
        if not raw_code.startswith("P"):
            continue
        digits = raw_code[1:]
        if digits.isdigit():
            next_number = max(next_number, int(digits) + 1)

    candidate = f"P{next_number:06d}"
    while Supplier.objects.filter(organization=organization, code=candidate).exists():
        next_number += 1
        candidate = f"P{next_number:06d}"
    return candidate


def enrich_party_with_hacienda(validated_data, instance=None, type_field_name="supplier_type"):
    party_type = validated_data.get(type_field_name) or getattr(instance, type_field_name, None)
    tax_id = validated_data.get("tax_id", getattr(instance, "tax_id", ""))
    normalized_tax_id = normalize_tax_id(tax_id)

    if not party_type or party_type.code == PHYSICAL_TYPE_CODE:
        return validated_data

    try:
        taxpayer = lookup_hacienda_taxpayer(normalized_tax_id)
    except Exception as exc:
        raise serializers.ValidationError({"tax_id": "No se pudo validar la cedula juridica en Hacienda."}) from exc
    if not taxpayer:
        raise serializers.ValidationError({"tax_id": "No se encontro informacion tributaria para esa cedula juridica."})

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


class SupplierTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierType
        fields = ["id", "code", "name"]


class SupplierSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True)

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
            "tax_regime_code",
            "tax_regime_description",
            "tax_status",
            "tax_administration",
            "tax_is_delinquent",
            "tax_is_omitted",
            "tax_activities",
            "tax_last_sync_at",
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
        attrs = clean_party_identity(attrs, instance=self.instance, type_field_name="supplier_type", party_label="proveedor")
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        tax_id = (attrs.get("tax_id") if "tax_id" in attrs else getattr(self.instance, "tax_id", "")) or ""
        normalized_tax_id = normalize_tax_id(tax_id)

        if organization and normalized_tax_id:
            queryset = Supplier.objects.filter(organization=organization, tax_id=normalized_tax_id)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({"tax_id": "Ya existe un proveedor con esa cédula en esta organización."})

        return attrs

    def validate_email(self, value):
        return (value or "").strip()

    def validate_phone(self, value):
        return (value or "").strip()

    def create(self, validated_data):
        validated_data = enrich_party_with_hacienda(validated_data, type_field_name="supplier_type")
        validated_data["code"] = get_next_supplier_code(validated_data["organization"])
        try:
            return super().create(validated_data)
        except IntegrityError as exc:
            message = str(exc).lower()
            if "uq_supplier_org_tax_id" in message:
                raise serializers.ValidationError({"tax_id": "Ya existe un proveedor con esa cédula en esta organización."})
            if "uq_supplier_org_code" in message:
                raise serializers.ValidationError({"code": "Ya existe un proveedor con ese código en esta organización."})
            raise serializers.ValidationError("No se pudo guardar el proveedor porque ya existe un registro duplicado.")

    def update(self, instance, validated_data):
        validated_data = enrich_party_with_hacienda(validated_data, instance=instance, type_field_name="supplier_type")
        return super().update(instance, validated_data)


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
