from datetime import timedelta
from decimal import Decimal, ROUND_FLOOR

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.loyalty.models import (
    LoyaltyMember,
    LoyaltyPointEntry,
    LoyaltyProgram,
    LoyaltyRedemption,
    LoyaltyReward,
    LoyaltyRule,
    LoyaltyTier,
)


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = [
            "id",
            "organization",
            "code",
            "name",
            "description",
            "points_name",
            "is_active",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        ]


class LoyaltyTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyTier
        fields = ["id", "program", "code", "name", "rank", "min_lifetime_points", "multiplier", "benefits"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program = attrs.get("program") or getattr(self.instance, "program", None)
        if not program:
            raise serializers.ValidationError({"program": "El programa es requerido."})
        return attrs


class LoyaltyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyRule
        fields = [
            "id",
            "program",
            "rule_type",
            "name",
            "description",
            "points_per_currency_unit",
            "currency_per_point",
            "minimum_purchase_amount",
            "minimum_points_to_redeem",
            "points_expire_in_days",
            "is_active",
            "starts_at",
            "ends_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program = attrs.get("program") or getattr(self.instance, "program", None)
        if not program:
            raise serializers.ValidationError({"program": "El programa es requerido."})
        return attrs


class LoyaltyMemberSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.legal_name", read_only=True)
    tier_name = serializers.CharField(source="tier.name", read_only=True)

    class Meta:
        model = LoyaltyMember
        fields = [
            "id",
            "program",
            "customer",
            "customer_name",
            "tier",
            "tier_name",
            "member_code",
            "enrolled_at",
            "status",
            "lifetime_points",
            "available_points",
            "reserved_points",
            "last_activity_at",
            "updated_at",
        ]
        read_only_fields = ["enrolled_at", "updated_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program = attrs.get("program") or getattr(self.instance, "program", None)
        customer = attrs.get("customer") or getattr(self.instance, "customer", None)
        tier = attrs.get("tier") or getattr(self.instance, "tier", None)

        if not program:
            raise serializers.ValidationError({"program": "El programa es requerido."})
        if not customer:
            raise serializers.ValidationError({"customer": "El cliente es requerido."})
        if customer.organization_id != program.organization_id:
            raise serializers.ValidationError({"customer": "El cliente debe pertenecer a la organizacion del programa."})
        if tier and tier.program_id != program.id:
            raise serializers.ValidationError({"tier": "El nivel debe pertenecer al mismo programa del miembro."})

        return attrs


class LoyaltyPointEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyPointEntry
        fields = [
            "id",
            "member",
            "program",
            "related_rule",
            "entry_type",
            "points",
            "source_reference",
            "source_metadata",
            "event_at",
            "expires_at",
            "created_at",
        ]
        read_only_fields = ["created_at"]


class LoyaltyRewardSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyReward
        fields = [
            "id",
            "program",
            "code",
            "name",
            "description",
            "points_cost",
            "stock",
            "is_unlimited_stock",
            "is_active",
            "starts_at",
            "ends_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program = attrs.get("program") or getattr(self.instance, "program", None)
        if not program:
            raise serializers.ValidationError({"program": "El programa es requerido."})
        return attrs


class LoyaltyRedemptionSerializer(serializers.ModelSerializer):
    reward_name = serializers.CharField(source="reward.name", read_only=True)

    class Meta:
        model = LoyaltyRedemption
        fields = [
            "id",
            "member",
            "program",
            "reward",
            "reward_name",
            "point_entry",
            "quantity",
            "points_spent",
            "status",
            "external_reference",
            "notes",
            "requested_at",
            "confirmed_at",
        ]
        read_only_fields = ["requested_at", "confirmed_at", "point_entry", "points_spent"]


class LoyaltyAccrualSerializer(serializers.Serializer):
    member = serializers.IntegerField()
    purchase_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    source_reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    event_at = serializers.DateTimeField(required=False)

    @transaction.atomic
    def create(self, validated_data):
        now = validated_data.get("event_at") or timezone.now()
        member = LoyaltyMember.objects.select_for_update().select_related("tier", "program").get(id=validated_data["member"])

        active_rule = (
            LoyaltyRule.objects.filter(program=member.program, rule_type=LoyaltyRule.RULE_EARN, is_active=True)
            .order_by("id")
            .first()
        )
        if not active_rule or not active_rule.points_per_currency_unit:
            raise serializers.ValidationError("No existe una regla activa de acumulación configurada.")

        base_points = (validated_data["purchase_amount"] * active_rule.points_per_currency_unit).quantize(Decimal("1"), rounding=ROUND_FLOOR)
        multiplier = member.tier.multiplier if member.tier else Decimal("1.00")
        awarded_points = int((base_points * multiplier).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        if awarded_points <= 0:
            raise serializers.ValidationError("El cálculo de puntos resultó en 0. Verifique la regla configurada.")

        expires_at = None
        if active_rule.points_expire_in_days:
            expires_at = now + timedelta(days=active_rule.points_expire_in_days)

        entry = LoyaltyPointEntry.objects.create(
            member=member,
            program=member.program,
            related_rule=active_rule,
            entry_type=LoyaltyPointEntry.TYPE_EARN,
            points=awarded_points,
            source_reference=validated_data.get("source_reference", ""),
            source_metadata={"purchase_amount": str(validated_data["purchase_amount"]), "tier_multiplier": str(multiplier)},
            event_at=now,
            expires_at=expires_at,
        )

        member.lifetime_points += awarded_points
        member.available_points += awarded_points
        member.last_activity_at = now
        member.save(update_fields=["lifetime_points", "available_points", "last_activity_at", "updated_at"])
        return entry


class LoyaltyRedeemSerializer(serializers.Serializer):
    member = serializers.IntegerField()
    reward = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, default=1)
    source_reference = serializers.CharField(max_length=120, required=False, allow_blank=True)

    @transaction.atomic
    def create(self, validated_data):
        now = timezone.now()
        member = LoyaltyMember.objects.select_for_update().select_related("program").get(id=validated_data["member"])
        reward = LoyaltyReward.objects.select_for_update().get(id=validated_data["reward"], program=member.program)

        if not reward.is_active:
            raise serializers.ValidationError("La recompensa seleccionada está inactiva.")

        if not reward.is_unlimited_stock and reward.stock < validated_data["quantity"]:
            raise serializers.ValidationError("Stock insuficiente para la recompensa seleccionada.")

        points_cost = reward.points_cost * validated_data["quantity"]
        if member.available_points < points_cost:
            raise serializers.ValidationError("El miembro no tiene puntos suficientes para este canje.")

        entry = LoyaltyPointEntry.objects.create(
            member=member,
            program=member.program,
            entry_type=LoyaltyPointEntry.TYPE_REDEEM,
            points=-points_cost,
            source_reference=validated_data.get("source_reference", ""),
            source_metadata={"reward_id": reward.id, "quantity": validated_data["quantity"]},
            event_at=now,
        )

        redemption = LoyaltyRedemption.objects.create(
            member=member,
            program=member.program,
            reward=reward,
            point_entry=entry,
            quantity=validated_data["quantity"],
            points_spent=points_cost,
            status=LoyaltyRedemption.STATUS_CONFIRMED,
            external_reference=validated_data.get("source_reference", ""),
            confirmed_at=now,
        )

        member.available_points -= points_cost
        member.last_activity_at = now
        member.save(update_fields=["available_points", "last_activity_at", "updated_at"])

        if not reward.is_unlimited_stock:
            reward.stock -= validated_data["quantity"]
            reward.save(update_fields=["stock"])

        return redemption
