from django.contrib.auth.models import User
from django.db import transaction
from django.utils.text import slugify
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
    organization_membership_role = serializers.SerializerMethodField(read_only=True)
    organization_name = serializers.SerializerMethodField(read_only=True)
    role_assignments = serializers.SerializerMethodField(read_only=True)

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
            "organization_membership_role",
            "organization_name",
            "role_assignments",
            "organization_id",
            "membership_role",
        ]

    def get_requires_password_setup(self, obj):
        return not obj.has_usable_password()

    def _get_context_organization_id(self):
        request = self.context.get("request")
        raw_id = request.query_params.get("organization_id") if request else None
        try:
            return int(raw_id) if raw_id else None
        except (TypeError, ValueError):
            return None

    def _get_context_membership(self, obj):
        organization_id = self._get_context_organization_id()
        queryset = obj.membership_set.select_related("organization")
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        return queryset.order_by("organization__name").first()

    def get_organization_membership_role(self, obj):
        membership = self._get_context_membership(obj)
        return membership.role if membership else ""

    def get_organization_name(self, obj):
        membership = self._get_context_membership(obj)
        return membership.organization.name if membership else ""

    def get_role_assignments(self, obj):
        organization_id = self._get_context_organization_id()
        queryset = obj.role_assignments.select_related("role").filter(is_active=True)
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        return [
            {
                "id": assignment.id,
                "role": assignment.role_id,
                "role_name": assignment.role.name,
                "role_code": assignment.role.code,
                "organization": assignment.organization_id,
            }
            for assignment in queryset.order_by("role__name")
        ]

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

        attrs["resolved_organization"] = organization
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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_system_owner = bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))
        code = attrs.get("code", getattr(self.instance, "code", ""))
        default_permissions = attrs.get("default_permissions", getattr(self.instance, "default_permissions", []))

        if not is_system_owner and code == "ti-super-admin":
            raise serializers.ValidationError({"code": "Este rol es exclusivo del dueño del sistema."})
        if not is_system_owner and "*" in (default_permissions or []):
            raise serializers.ValidationError({"default_permissions": "El permiso total solo puede usarlo el dueño del sistema."})
        return attrs


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_system_owner = bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))
        role = attrs.get("role", getattr(self.instance, "role", None))
        if role and role.code == "ti-super-admin" and not is_system_owner:
            raise serializers.ValidationError({"role": "Este rol es exclusivo del dueño del sistema."})
        return attrs


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
        queryset = User.objects.filter(email__iexact=normalized)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        user = attrs.get("user", getattr(self.instance, "user", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))

        if not user:
            raise serializers.ValidationError({"user": "Selecciona un usuario."})
        if not organization:
            raise serializers.ValidationError({"organization": "Selecciona una organizaciÃ³n."})

        queryset = Membership.objects.filter(user=user, organization=organization)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError({"user": "Este usuario ya tiene acceso a esta organizaciÃ³n."})
        return attrs


class SystemAdminOrganizationSerializer(serializers.ModelSerializer):
    subscription_status = serializers.CharField(source="subscription.status", read_only=True)
    subscription_plan_name = serializers.CharField(source="subscription.plan_catalog.name", read_only=True)
    memberships_count = serializers.SerializerMethodField()
    invoice_count = serializers.SerializerMethodField()
    next_invoice_consecutive = serializers.SerializerMethodField()

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
            "invoice_count",
            "next_invoice_consecutive",
        ]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
            "parent_organization": {"required": False, "allow_null": True},
        }

    def get_memberships_count(self, obj):
        return obj.membership_set.count()

    def get_invoice_count(self, obj):
        from apps.finance.models import Invoice

        return Invoice.objects.filter(organization=obj).count()

    def get_next_invoice_consecutive(self, obj):
        from apps.finance.models import Invoice

        prefix = f"{obj.hacienda_branch_code}{obj.hacienda_terminal_code}01"
        latest = (
            Invoice.objects.filter(organization=obj, consecutive_number__startswith=prefix)
            .order_by("-consecutive_number")
            .values_list("consecutive_number", flat=True)
            .first()
        )
        sequence = int(latest[10:]) + 1 if latest and len(latest) == 20 and latest[10:].isdigit() else 1
        return f"{prefix}{sequence:010d}"

    def validate_name(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 3:
            raise serializers.ValidationError("El nombre debe tener al menos 3 caracteres.")
        return clean_value

    def validate_slug(self, value):
        clean_value = (value or "").strip().lower()
        if not clean_value:
            return clean_value
        slug = slugify(clean_value)
        if slug != clean_value:
            raise serializers.ValidationError("Usa solo minÃºsculas, nÃºmeros y guiones.")
        queryset = Organization.objects.filter(slug=clean_value)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una organizaciÃ³n con este slug.")
        return clean_value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        branch = attrs.get("hacienda_branch_code", getattr(self.instance, "hacienda_branch_code", "001"))
        terminal = attrs.get("hacienda_terminal_code", getattr(self.instance, "hacienda_terminal_code", "00001"))

        if not str(branch).isdigit() or len(str(branch)) != 3:
            raise serializers.ValidationError({"hacienda_branch_code": "Debe contener exactamente 3 dÃ­gitos."})
        if not str(terminal).isdigit() or len(str(terminal)) != 5:
            raise serializers.ValidationError({"hacienda_terminal_code": "Debe contener exactamente 5 dÃ­gitos."})

        if branch == "000":
            raise serializers.ValidationError({"hacienda_branch_code": "La sucursal de Hacienda debe estar entre 001 y 999."})
        if terminal == "00000":
            raise serializers.ValidationError({"hacienda_terminal_code": "La terminal de Hacienda debe estar entre 00001 y 99999."})

        if self.instance and (
            branch != self.instance.hacienda_branch_code or terminal != self.instance.hacienda_terminal_code
        ):
            from apps.finance.models import Invoice

            if Invoice.objects.filter(organization=self.instance).exists():
                raise serializers.ValidationError({
                    "hacienda_terminal_code": "No se puede cambiar sucursal o terminal si la organizacion ya tiene facturas emitidas; afectaria el consecutivo Hacienda."
                })

        queryset = Organization.objects.filter(hacienda_branch_code=branch, hacienda_terminal_code=terminal)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError({
                "hacienda_terminal_code": "Ya existe una organizaciÃ³n con esta sucursal y terminal de Hacienda."
            })
        return attrs


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

    def validate_code(self, value):
        clean_value = (value or "").strip().lower()
        if len(clean_value) < 2:
            raise serializers.ValidationError("El cÃ³digo debe tener al menos 2 caracteres.")
        if slugify(clean_value) != clean_value:
            raise serializers.ValidationError("Usa solo minÃºsculas, nÃºmeros y guiones.")
        queryset = SaaSModule.objects.filter(code=clean_value)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe un mÃ³dulo con este cÃ³digo.")
        return clean_value

    def validate_name(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 3:
            raise serializers.ValidationError("El nombre debe tener al menos 3 caracteres.")
        return clean_value

    def validate_route_hint(self, value):
        clean_value = (value or "").strip()
        if clean_value and not clean_value.startswith("/"):
            raise serializers.ValidationError("La ruta debe iniciar con /.")
        return clean_value


class SaaSPlanModuleSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)
    module_group = serializers.CharField(source="module.group", read_only=True)

    class Meta:
        model = SaaSPlanModule
        fields = ["id", "plan", "module", "module_name", "module_group", "is_included", "sort_order"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        plan = attrs.get("plan", getattr(self.instance, "plan", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        if not plan:
            raise serializers.ValidationError({"plan": "Selecciona un plan."})
        if not module:
            raise serializers.ValidationError({"module": "Selecciona un mÃ³dulo."})
        queryset = SaaSPlanModule.objects.filter(plan=plan, module=module)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError({"module": "Este mÃ³dulo ya estÃ¡ incluido en el plan."})
        return attrs


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

    def validate_code(self, value):
        clean_value = (value or "").strip().lower()
        if len(clean_value) < 2:
            raise serializers.ValidationError("El cÃ³digo debe tener al menos 2 caracteres.")
        if slugify(clean_value) != clean_value:
            raise serializers.ValidationError("Usa solo minÃºsculas, nÃºmeros y guiones.")
        queryset = SaaSPlan.objects.filter(code=clean_value)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe un plan con este cÃ³digo.")
        return clean_value

    def validate_name(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 3:
            raise serializers.ValidationError("El nombre debe tener al menos 3 caracteres.")
        return clean_value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        monthly = attrs.get("monthly_price", getattr(self.instance, "monthly_price", 0))
        annual = attrs.get("annual_price", getattr(self.instance, "annual_price", 0))
        if monthly is not None and monthly < 0:
            raise serializers.ValidationError({"monthly_price": "El precio mensual no puede ser negativo."})
        if annual is not None and annual < 0:
            raise serializers.ValidationError({"annual_price": "El precio anual no puede ser negativo."})
        return attrs


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        subscription = attrs.get("subscription", getattr(self.instance, "subscription", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        source = attrs.get("source", getattr(self.instance, "source", SubscriptionModule.SOURCE_PLAN))

        if not subscription:
            raise serializers.ValidationError({"subscription": "Selecciona una suscripciÃ³n."})
        if not module:
            raise serializers.ValidationError({"module": "Selecciona un mÃ³dulo."})
        if source == SubscriptionModule.SOURCE_PLAN and not subscription.plan_catalog_id:
            raise serializers.ValidationError({"source": "Solo los planes sincronizados pueden crear mÃ³dulos con origen Plan."})

        queryset = SubscriptionModule.objects.filter(subscription=subscription, module=module)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError({"module": "Este mÃ³dulo ya estÃ¡ asignado a la suscripciÃ³n."})
        return attrs


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        plan_catalog = attrs.get("plan_catalog", getattr(self.instance, "plan_catalog", None))
        status = attrs.get("status", getattr(self.instance, "status", Subscription.STATUS_TRIAL))
        billing_cycle = attrs.get("billing_cycle", getattr(self.instance, "billing_cycle", Subscription.BILLING_MONTHLY))
        base_price = attrs.get("base_price", getattr(self.instance, "base_price", 0))
        next_billing_date = attrs.get("next_billing_date", getattr(self.instance, "next_billing_date", None))

        if not organization:
            raise serializers.ValidationError({"organization": "Selecciona una organizaciÃ³n."})
        if not plan_catalog:
            raise serializers.ValidationError({"plan_catalog": "Selecciona un plan."})
        if base_price is not None and base_price < 0:
            raise serializers.ValidationError({"base_price": "El precio base no puede ser negativo."})
        if status in [Subscription.STATUS_ACTIVE, Subscription.STATUS_PAST_DUE] and not next_billing_date:
            raise serializers.ValidationError({"next_billing_date": "Indica la fecha del prÃ³ximo cobro para suscripciones activas o pendientes."})
        if status == Subscription.STATUS_CANCELLED:
            attrs["is_active"] = False
        elif status in [Subscription.STATUS_TRIAL, Subscription.STATUS_ACTIVE]:
            attrs["is_active"] = True
        if billing_cycle == Subscription.BILLING_ANNUAL and plan_catalog and base_price == 0:
            attrs["base_price"] = plan_catalog.annual_price
        elif billing_cycle == Subscription.BILLING_MONTHLY and plan_catalog and base_price == 0:
            attrs["base_price"] = plan_catalog.monthly_price
        return attrs

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

    def validate_key(self, value):
        clean_value = (value or "").strip().lower()
        if len(clean_value) < 2:
            raise serializers.ValidationError("La key debe tener al menos 2 caracteres.")
        if slugify(clean_value) != clean_value:
            raise serializers.ValidationError("Usa solo minÃºsculas, nÃºmeros y guiones.")
        return clean_value

    def validate_label(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 3:
            raise serializers.ValidationError("La etiqueta debe tener al menos 3 caracteres.")
        return clean_value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        key = attrs.get("key", getattr(self.instance, "key", ""))
        if not organization:
            raise serializers.ValidationError({"organization": "Selecciona una organizaciÃ³n."})
        queryset = OrganizationFeatureFlag.objects.filter(organization=organization, key=key)
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError({"key": "Esta organizaciÃ³n ya tiene una feature flag con esa key."})
        return attrs
