from django.contrib import admin

from apps.loyalty.models import (
    LoyaltyMember,
    LoyaltyPointEntry,
    LoyaltyProgram,
    LoyaltyRedemption,
    LoyaltyReward,
    LoyaltyRule,
    LoyaltyTier,
)

admin.site.register(LoyaltyProgram)
admin.site.register(LoyaltyTier)
admin.site.register(LoyaltyRule)
admin.site.register(LoyaltyMember)
admin.site.register(LoyaltyPointEntry)
admin.site.register(LoyaltyReward)
admin.site.register(LoyaltyRedemption)
