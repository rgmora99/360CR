from django.contrib.auth.models import User
from rest_framework import serializers

from apps.configuration.models import RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment


class ConfigurationUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "is_active", "is_staff"]


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
