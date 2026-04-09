from rest_framework.routers import DefaultRouter

from apps.loyalty.views import (
    LoyaltyMemberViewSet,
    LoyaltyPointEntryViewSet,
    LoyaltyProgramViewSet,
    LoyaltyRedemptionViewSet,
    LoyaltyRewardViewSet,
    LoyaltyRuleViewSet,
    LoyaltyTierViewSet,
)

router = DefaultRouter()
router.register(r"loyalty-programs", LoyaltyProgramViewSet, basename="loyalty-program")
router.register(r"loyalty-tiers", LoyaltyTierViewSet, basename="loyalty-tier")
router.register(r"loyalty-rules", LoyaltyRuleViewSet, basename="loyalty-rule")
router.register(r"loyalty-members", LoyaltyMemberViewSet, basename="loyalty-member")
router.register(r"loyalty-entries", LoyaltyPointEntryViewSet, basename="loyalty-entry")
router.register(r"loyalty-rewards", LoyaltyRewardViewSet, basename="loyalty-reward")
router.register(r"loyalty-redemptions", LoyaltyRedemptionViewSet, basename="loyalty-redemption")

urlpatterns = router.urls
