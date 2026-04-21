from django.contrib import admin
from .models import (
    Membership,
    Organization,
    OrganizationFeatureFlag,
    SaaSModule,
    SaaSPlan,
    SaaSPlanModule,
    Subscription,
    SubscriptionModule,
)


admin.site.register(Organization)
admin.site.register(Membership)
admin.site.register(Subscription)
admin.site.register(SaaSModule)
admin.site.register(SaaSPlan)
admin.site.register(SaaSPlanModule)
admin.site.register(SubscriptionModule)
admin.site.register(OrganizationFeatureFlag)
