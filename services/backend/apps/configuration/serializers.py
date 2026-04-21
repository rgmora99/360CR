from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from apps.configuration.models import OrganizationEmailInbox, RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment
from apps.tenants.models import (
    Membership,
    Organization,
    OrganizationFeatureFlag,
    SaaSModule,
    SaaSPlan,
    SaaSPlanModule,
    Subscription,
    SubscriptionModule,
)


def sync_subscription_modules(subscription):
    if not subscription.plan_catalog_id:
        return

    included_modules = {
        plan_module.module_id: plan_module
        for plan_module in subscription.plan_catalog.plan_modules.select_related("module").filter(is_included=True)
    }
    current_links = {
        link.module_id: link
        for link in subscription.subscription_modules.select_related("module").all()
    }

    for module_id in list(current_links):
        link = current_links[module_id]
        if link.source == SubscriptionModule.SOURCE_PLAN and module_id not in included_modules:
            link.delete()

    for module_id in included_modules:
        link = current_links.get(module_id)
        if link:
            updates = []
            if link.source != SubscriptionModule.SOURCE_PLAN:
                link.source = SubscriptionModule.SOURCE_PLAN
                updates.append("source")
            if not link.is_enabled:
                link.is_enabled = True
                updates.append("is_enabled")
            if updates:
                link.save(update_fields=[*updates, "updated_at"])
            continue
        SubscriptionModule.objects.create(
            subscription=subscription,
            module_id=module_id,
            source=SubscriptionModule.SOURCE_PLAN,
            is_enabled=True,
        )


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
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

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

    def validate_email(self, value):
        normalized = (value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("El correo es requerido.")
        return normalized

    def validate_username(self, value):
        clean_value = (value or "").strip()
        if not clean_value:
            raise serializers.ValidationError("El usuario IMAP es requerido.")
        return clean_value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        is_primary = attrs.get("is_primary", getattr(self.instance, "is_primary", False))
        email = attrs.get("email", getattr(self.instance, "email", "")).strip().lower()
        username = attrs.get("username", getattr(self.instance, "username", "")).strip()
        password = attrs.get("password", "")
        imap_host = (attrs.get("imap_host", getattr(self.instance, "imap_host", "")) or "").strip()
        imap_port = attrs.get("imap_port", getattr(self.instance, "imap_port", None))
        folder = (attrs.get("folder", getattr(self.instance, "folder", "")) or "").strip()

        attrs["email"] = email
        attrs["username"] = username
        attrs["imap_host"] = imap_host
        attrs["folder"] = folder or "INBOX"

        if not organization:
            raise serializers.ValidationError({"organization": "La organización es requerida."})
        if not email:
            raise serializers.ValidationError({"email": "El correo es requerido."})
        if not username:
            raise serializers.ValidationError({"username": "El usuario IMAP es requerido."})
        if not self.instance and not password:
            raise serializers.ValidationError({"password": "La contraseña IMAP es requerida."})
        if imap_port is None or int(imap_port) <= 0:
            raise serializers.ValidationError({"imap_port": "El puerto IMAP debe ser mayor a 0."})

        duplicate_queryset = OrganizationEmailInbox.objects.filter(organization=organization, email=email)
        if self.instance:
            duplicate_queryset = duplicate_queryset.exclude(id=self.instance.id)
        if duplicate_queryset.exists():
            raise serializers.ValidationError({"email": "Ya existe una conexión registrada para ese correo en esta organización."})

        if organization and is_primary:
            queryset = OrganizationEmailInbox.objects.filter(organization=organization, is_primary=True)
            if self.instance:
                queryset = queryset.exclude(id=self.instance.id)
            if queryset.exists():
                raise serializers.ValidationError({"is_primary": "Ya existe un correo principal para esta organización."})
        return attrs

    def update(self, instance, validated_data):
        if validated_data.get("password", None) == "":
            validated_data.pop("password", None)
        return super().update(instance, validated_data)


class SimpleMembershipSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "organization", "organization_name", "role"]


class SystemAdminUserSerializer(serializers.ModelSerializer):
    memberships = SimpleMembershipSerializer(source="membership_set", many=True, read_only=True)
    requires_password_setup = serializers.SerializerMethodField()

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
            "is_superuser",
            "requires_password_setup",
            "memberships",
        ]
        read_only_fields = ["is_superuser"]
        extra_kwargs = {
            "username": {"required": False, "allow_blank": True},
        }

    def get_requires_password_setup(self, obj):
        return not obj.has_usable_password()

    def validate_email(self, value):
        normalized = (value or "").strip().lower()
        if not normalized:
            raise serializers.ValidationError("El correo es requerido.")
        return normalized

    def create(self, validated_data):
        email = validated_data["email"]
        validated_data["username"] = validated_data.get("username") or email
        user = User(**validated_data)
        user.set_unusable_password()
        user.save()
        return user


class SystemAdminMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "user_email", "organization", "organization_name", "role"]


class SystemAdminOrganizationSerializer(serializers.ModelSerializer):
    subscription_status = serializers.CharField(source="subscription.status", read_only=True)
    subscription_plan_name = serializers.CharField(source="subscription.plan_catalog.name", read_only=True)
    memberships_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "slug",
            "parent_organization",
            "hacienda_branch_code",
            "hacienda_terminal_code",
            "created_at",
            "subscription_status",
            "subscription_plan_name",
            "memberships_count",
        ]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
            "parent_organization": {"required": False, "allow_null": True},
        }

    def get_memberships_count(self, obj):
        return obj.membership_set.count()


class SaaSModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaaSModule
        fields = [
            "id",
            "code",
            "name",
            "group",
            "description",
            "route_hint",
            "is_active",
            "is_public",
            "sort_order",
            "created_at",
            "updated_at",
        ]


class SaaSPlanModuleSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_group = serializers.CharField(source="module.group", read_only=True)

    class Meta:
        model = SaaSPlanModule
        fields = ["id", "plan", "module", "module_name", "module_group", "is_included", "sort_order"]


class SaaSPlanSerializer(serializers.ModelSerializer):
    modules_detail = SaaSPlanModuleSerializer(source="plan_modules", many=True, read_only=True)

    class Meta:
        model = SaaSPlan
        fields = [
            "id",
            "code",
            "name",
            "description",
            "sort_order",
            "is_active",
            "monthly_price",
            "annual_price",
            "recommended_billing_cycle",
            "modules_detail",
            "created_at",
            "updated_at",
        ]


class SubscriptionModuleSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_group = serializers.CharField(source="module.group", read_only=True)

    class Meta:
        model = SubscriptionModule
        fields = [
            "id",
            "subscription",
            "module",
            "module_name",
            "module_group",
            "is_enabled",
            "source",
            "activated_at",
            "updated_at",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    plan_catalog_name = serializers.CharField(source="plan_catalog.name", read_only=True)
    active_modules = SubscriptionModuleSerializer(source="subscription_modules", many=True, read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id",
            "organization",
            "organization_name",
            "plan",
            "plan_catalog",
            "plan_catalog_name",
            "status",
            "billing_cycle",
            "is_active",
            "started_at",
            "trial_ends_at",
            "expires_at",
            "next_billing_date",
            "base_price",
            "notes",
            "active_modules",
        ]

    def create(self, validated_data):
        with transaction.atomic():
            subscription = super().create(validated_data)
            sync_subscription_modules(subscription)
            return subscription

    def update(self, instance, validated_data):
        with transaction.atomic():
            subscription = super().update(instance, validated_data)
            sync_subscription_modules(subscription)
            return subscription


class OrganizationFeatureFlagSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)

    class Meta:
        model = OrganizationFeatureFlag
        fields = [
            "id",
            "organization",
            "organization_name",
            "module",
            "module_name",
            "key",
            "label",
            "description",
            "is_enabled",
            "config",
            "updated_at",
        ]
