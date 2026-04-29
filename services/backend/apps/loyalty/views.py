from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.loyalty.models import (
    LoyaltyMember,
    LoyaltyPointEntry,
    LoyaltyProgram,
    LoyaltyRedemption,
    LoyaltyReward,
    LoyaltyRule,
    LoyaltyTier,
)
from apps.loyalty.serializers import (
    LoyaltyAccrualSerializer,
    LoyaltyMemberSerializer,
    LoyaltyPointEntrySerializer,
    LoyaltyProgramSerializer,
    LoyaltyRedeemSerializer,
    LoyaltyRedemptionSerializer,
    LoyaltyRewardSerializer,
    LoyaltyRuleSerializer,
    LoyaltyTierSerializer,
)
from apps.tenants.access import OrganizationScopedViewMixin


class LoyaltyProgramViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = LoyaltyProgramSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyProgram.objects.all()
        return self.scope_queryset(queryset)


class LoyaltyTierViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyTierSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("program.organization_id",)
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyTier.objects.select_related("program")
        return self.scope_queryset(queryset)


class LoyaltyRuleViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyRuleSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("program.organization_id",)
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyRule.objects.select_related("program")
        return self.scope_queryset(queryset)


class LoyaltyMemberViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyMemberSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("program.organization_id", "customer.organization_id", "tier.program.organization_id")
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyMember.objects.select_related("program", "customer", "tier")
        return self.scope_queryset(queryset)

    @action(detail=False, methods=["post"], url_path="accrue")
    def accrue(self, request):
        serializer = LoyaltyAccrualSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        member = LoyaltyMember.objects.select_related("program").filter(id=serializer.validated_data["member"]).first()
        if not member:
            return Response({"detail": "Miembro no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        self.validate_organization_payload(member.program.organization_id)

        entry = serializer.save()
        return Response(LoyaltyPointEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="redeem")
    def redeem(self, request):
        serializer = LoyaltyRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        member = LoyaltyMember.objects.select_related("program").filter(id=serializer.validated_data["member"]).first()
        if not member:
            return Response({"detail": "Miembro no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        self.validate_organization_payload(member.program.organization_id)

        redemption = serializer.save()
        return Response(LoyaltyRedemptionSerializer(redemption).data, status=status.HTTP_201_CREATED)


class LoyaltyPointEntryViewSet(OrganizationScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyPointEntrySerializer
    permission_classes = [IsAuthenticated]
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyPointEntry.objects.select_related("program", "member", "related_rule")
        member_id = self.request.query_params.get("member_id")
        if member_id:
            queryset = queryset.filter(member_id=member_id)
        return self.scope_queryset(queryset)


class LoyaltyRewardViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyRewardSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("program.organization_id",)
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyReward.objects.select_related("program")
        return self.scope_queryset(queryset)


class LoyaltyRedemptionViewSet(OrganizationScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    organization_lookup_field = "program__organization_id"
    serializer_class = LoyaltyRedemptionSerializer
    permission_classes = [IsAuthenticated]
    required_module_code = "loyalty"

    def get_queryset(self):
        queryset = LoyaltyRedemption.objects.select_related("program", "member", "reward", "point_entry")
        member_id = self.request.query_params.get("member_id")
        if member_id:
            queryset = queryset.filter(member_id=member_id)
        return self.scope_queryset(queryset)
