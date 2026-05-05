from rest_framework import serializers

from apps.core.tax_registry import normalize_tax_id


PHYSICAL_TYPE_CODE = "fisico"


def clean_party_identity(attrs, instance=None, type_field_name="customer_type", party_label="registro"):
    party_type = attrs.get(type_field_name) or getattr(instance, type_field_name, None)
    type_code = getattr(party_type, "code", "")
    raw_tax_id = attrs.get("tax_id") if "tax_id" in attrs else getattr(instance, "tax_id", "")
    normalized_tax_id = normalize_tax_id(raw_tax_id)
    raw_legal_name = attrs.get("legal_name") if "legal_name" in attrs else getattr(instance, "legal_name", "")
    legal_name = str(raw_legal_name or "").strip()

    errors = {}
    if not party_type:
        errors[type_field_name] = f"Debe seleccionar el tipo de {party_label}."

    if not normalized_tax_id:
        errors["tax_id"] = "La cedula es obligatoria."
    elif type_code == PHYSICAL_TYPE_CODE and len(normalized_tax_id) != 9:
        errors["tax_id"] = "La cedula fisica debe tener 9 digitos."
    elif type_code != PHYSICAL_TYPE_CODE and len(normalized_tax_id) != 10:
        errors["tax_id"] = "La cedula juridica debe tener 10 digitos."

    if not legal_name:
        errors["legal_name"] = "El nombre o razon social es obligatorio."
    elif len(legal_name) < 3:
        errors["legal_name"] = "El nombre o razon social debe tener al menos 3 caracteres."
    elif not any(character.isalpha() for character in legal_name):
        errors["legal_name"] = "El nombre o razon social debe contener letras."

    if errors:
        raise serializers.ValidationError(errors)

    if "tax_id" in attrs or instance is None:
        attrs["tax_id"] = normalized_tax_id
    if "legal_name" in attrs or instance is None:
        attrs["legal_name"] = legal_name
    if "trade_name" in attrs:
        attrs["trade_name"] = str(attrs.get("trade_name") or "").strip()

    return attrs
