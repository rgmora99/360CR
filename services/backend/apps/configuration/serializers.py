from django.contrib.auth.models import User
from rest_framework import serializers

from apps.configuration.models import OrganizationEmailInbox, RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.tenants.models import Membership, Organization


class ConfigurationUserSerializer(serializers.ModelSerializer):
    organization_id = serializers.IntegerField(write_only=True, required=False)
    membership_role = serializers.ChoiceField(choices=Membership.ROLE_CHOICES, write_only=True, required=False)
    requires_password_setup = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "requires_password_setup",
            "organization_id",
            "membership_role",
        ]

    def get_requires_password_setup(self, obj):
        return not obj.has_usable_password()

    def validate_email(self, value):
        normalized = (value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("El correo es requerido.")
        return normalized

    def validate(self, attrs):
        if self.instance:
            return attrs

        organization_id = attrs.pop("organization_id", None)
        if not organization_id:
            raise serializers.ValidationError({"organization_id": "Debe indicar la organización activa."})

        try:
            organization = Organization.objects.get(id=int(organization_id))
        except (TypeError, ValueError, Organization.DoesNotExist):
            raise serializers.ValidationError({"organization_id": "Organización inválida."}) from None

        root_org = organization
        while root_org.parent_organization_id:
            root_org = root_org.parent_organization

        attrs["resolved_organization"] = root_org
        attrs["membership_role"] = attrs.get("membership_role") or Membership.ROLE_VIEWER
        return attrs

    def create(self, validated_data):
        organization = validated_data.pop("resolved_organization")
        role = validated_data.pop("membership_role")
        email = validated_data.get("email", "").strip().lower()
        validated_data["email"] = email
        validated_data["username"] = validated_data.get("username") or email

        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
        Membership.objects.get_or_create(
            user=user,
            organization=organization,
            defaults={"role": role},
        )
        return user


class RoleCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoleCatalog
        fields = [
            "id",
            "code",
            "name",
            "persona",
            "description",
            "typical_scenarios",
            "default_permissions",
            "is_system_default",
        ]


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ["id", "key", "category", "description", "value", "is_sensitive", "updated_at"]


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = [
            "id",
            "user",
            "language",
            "timezone",
            "notifications_email",
            "notifications_sms",
            "dashboard_widgets",
            "updated_at",
        ]


class UserRoleAssignmentSerializer(serializers.ModelSerializer):
    role_detail = RoleCatalogSerializer(source="role", read_only=True)

    class Meta:
        model = UserRoleAssignment
        fields = [
            "id",
            "user",
            "role",
            "role_detail",
            "organization",
            "assigned_by",
            "is_active",
            "assigned_at",
        ]
        read_only_fields = ["assigned_by", "assigned_at"]


class OrganizationEmailInboxSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = OrganizationEmailInbox
        fields = [
            "id",
            "organization",
            "label",
            "email",
            "username",
            "password",
            "imap_host",
            "imap_port",
            "imap_ssl",
            "folder",
            "is_primary",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        is_primary = attrs.get("is_primary", getattr(self.instance, "is_primary", False))
        if organization and is_primary:
            queryset = OrganizationEmailInbox.objects.filter(organization=organization, is_primary=True)
            if self.instance:
                queryset = queryset.exclude(id=self.instance.id)
            if queryset.exists():
                raise serializers.ValidationError({"is_primary": "Ya existe un correo principal para esta organización."})
        return attrs
