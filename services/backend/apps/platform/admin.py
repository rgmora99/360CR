from django.contrib import admin
from .models import OrganizationModuleAddon, OrganizationPlan, Plan, PlanModule, SaaSModule


admin.site.register(SaaSModule)
admin.site.register(Plan)
admin.site.register(PlanModule)
admin.site.register(OrganizationPlan)
admin.site.register(OrganizationModuleAddon)
