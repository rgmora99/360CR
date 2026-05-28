from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models

from apps.customers.models import Customer
from apps.tenants.models import Organization


class LoyaltyProgram(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="loyalty_programs")
    code = models.SlugField(max_length=40)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    points_name = models.CharField(max_length=40, default="Puntos")
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization_id", "name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="uq_loyalty_program_org_code"),
            models.CheckConstraint(
                condition=models.Q(end_date__isnull=True) | models.Q(start_date__isnull=True) | models.Q(end_date__gte=models.F("start_date")),
                name="ck_loyalty_program_dates",
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "is_active"], name="idx_lp_org_active"),
        ]

    def __str__(self) -> str:
        return f"{self.organization_id} - {self.name}"


class LoyaltyTier(models.Model):
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name="tiers")
    code = models.SlugField(max_length=40)
    name = models.CharField(max_length=80)
    rank = models.PositiveSmallIntegerField()
    min_lifetime_points = models.PositiveIntegerField(default=0)
    multiplier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("1.00"), validators=[MinValueValidator(Decimal("0.01"))])
    benefits = models.TextField(blank=True)

    class Meta:
        ordering = ["program_id", "rank"]
        constraints = [
            models.UniqueConstraint(fields=["program", "code"], name="uq_loyalty_tier_program_code"),
            models.UniqueConstraint(fields=["program", "rank"], name="uq_loyalty_tier_program_rank"),
            models.CheckConstraint(condition=models.Q(multiplier__gte=Decimal("0.01")), name="ck_loyalty_tier_multiplier_positive"),
        ]

    def __str__(self) -> str:
        return f"{self.program_id} - {self.name}"


class LoyaltyRule(models.Model):
    RULE_EARN = "earn"
    RULE_REDEEM = "redeem"
    RULE_EXPIRATION = "expiration"
    RULE_CHOICES = [
        (RULE_EARN, "Acumulación"),
        (RULE_REDEEM, "Canje"),
        (RULE_EXPIRATION, "Expiración"),
    ]

    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name="rules")
    rule_type = models.CharField(max_length=20, choices=RULE_CHOICES)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    points_per_currency_unit = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    currency_per_point = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    minimum_purchase_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    minimum_points_to_redeem = models.PositiveIntegerField(default=0)
    points_expire_in_days = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["program_id", "rule_type", "id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True) | models.Q(starts_at__isnull=True) | models.Q(ends_at__gte=models.F("starts_at")),
                name="ck_loyalty_rule_dates",
            ),
        ]
        indexes = [models.Index(fields=["program", "rule_type", "is_active"], name="idx_lrule_program_type")]


class LoyaltyMember(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_SUSPENDED = "suspended"
    STATUS_INACTIVE = "inactive"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Activo"),
        (STATUS_SUSPENDED, "Suspendido"),
        (STATUS_INACTIVE, "Inactivo"),
    ]

    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name="members")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="loyalty_memberships")
    tier = models.ForeignKey(LoyaltyTier, on_delete=models.PROTECT, related_name="members", null=True, blank=True)
    member_code = models.CharField(max_length=40)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    lifetime_points = models.PositiveIntegerField(default=0)
    available_points = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reserved_points = models.PositiveIntegerField(default=0)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["program_id", "-enrolled_at"]
        constraints = [
            models.UniqueConstraint(fields=["program", "customer"], name="uq_loyalty_member_program_customer"),
            models.UniqueConstraint(fields=["program", "member_code"], name="uq_loyalty_member_program_code"),
            models.CheckConstraint(condition=models.Q(lifetime_points__gte=0), name="ck_loyalty_member_lifetime_non_negative"),
            models.CheckConstraint(condition=models.Q(available_points__gte=0), name="ck_loyalty_member_available_non_negative"),
            models.CheckConstraint(condition=models.Q(reserved_points__gte=0), name="ck_loyalty_member_reserved_non_negative"),
        ]
        indexes = [
            models.Index(fields=["program", "status"], name="idx_lm_program_status"),
            models.Index(fields=["customer"], name="idx_lm_customer"),
        ]


class LoyaltyPointEntry(models.Model):
    TYPE_EARN = "earn"
    TYPE_REDEEM = "redeem"
    TYPE_ADJUSTMENT = "adjustment"
    TYPE_EXPIRATION = "expiration"
    TYPE_RESERVATION = "reservation"
    TYPE_RELEASE = "release"
    ENTRY_TYPE_CHOICES = [
        (TYPE_EARN, "Acumulación"),
        (TYPE_REDEEM, "Canje"),
        (TYPE_ADJUSTMENT, "Ajuste"),
        (TYPE_EXPIRATION, "Expiración"),
        (TYPE_RESERVATION, "Reserva"),
        (TYPE_RELEASE, "Liberación"),
    ]

    member = models.ForeignKey(LoyaltyMember, on_delete=models.CASCADE, related_name="point_entries")
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name="point_entries")
    related_rule = models.ForeignKey(LoyaltyRule, on_delete=models.SET_NULL, null=True, blank=True, related_name="point_entries")
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPE_CHOICES)
    points = models.IntegerField()
    source_reference = models.CharField(max_length=120, blank=True)
    source_metadata = models.JSONField(default=dict, blank=True)
    event_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-event_at", "-id"]
        indexes = [
            models.Index(fields=["member", "event_at"], name="idx_lpe_member_event"),
            models.Index(fields=["program", "entry_type", "event_at"], name="idx_lpe_program_type"),
            models.Index(fields=["expires_at"], name="idx_lpe_expiry"),
        ]


class LoyaltyReward(models.Model):
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE, related_name="rewards")
    code = models.SlugField(max_length=40)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    points_cost = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    stock = models.PositiveIntegerField(default=0)
    is_unlimited_stock = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["program_id", "name"]
        constraints = [
            models.UniqueConstraint(fields=["program", "code"], name="uq_loyalty_reward_program_code"),
            models.CheckConstraint(condition=models.Q(points_cost__gte=1), name="ck_loyalty_reward_points_cost_positive"),
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True) | models.Q(starts_at__isnull=True) | models.Q(ends_at__gte=models.F("starts_at")),
                name="ck_loyalty_reward_dates",
            ),
        ]
        indexes = [models.Index(fields=["program", "is_active"], name="idx_lrw_program_active")]


class LoyaltyRedemption(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Borrador"),
        (STATUS_CONFIRMED, "Confirmado"),
        (STATUS_CANCELLED, "Cancelado"),
    ]

    member = models.ForeignKey(LoyaltyMember, on_delete=models.PROTECT, related_name="redemptions")
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.PROTECT, related_name="redemptions")
    reward = models.ForeignKey(LoyaltyReward, on_delete=models.PROTECT, related_name="redemptions")
    point_entry = models.OneToOneField(LoyaltyPointEntry, on_delete=models.PROTECT, related_name="redemption", null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    points_spent = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    external_reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["program", "status", "requested_at"], name="idx_lr_program_status"),
            models.Index(fields=["member", "requested_at"], name="idx_lr_member_date"),
        ]
