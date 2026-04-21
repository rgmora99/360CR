from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.configuration.views import (
    ConfigurationUserViewSet,
    OrganizationCollaboratorView,
    OrganizationEmailInboxViewSet,
    OrganizationFeatureFlagViewSet,
    RoleCatalogViewSet,
    SaaSModuleViewSet,
    SaaSPlanModuleViewSet,
    SaaSPlanViewSet,
    SubscriptionModuleViewSet,
    SubscriptionViewSet,
    SystemAdminMembershipViewSet,
    SystemAdminOrganizationViewSet,
    SystemAdminOverviewView,
    SystemAdminUserViewSet,
    SystemSettingViewSet,
    UserPreferenceViewSet,
    UserRoleAssignmentViewSet,
)

router = DefaultRouter()
router.register(r"config/users", ConfigurationUserViewSet, basename="config-user")
router.register(r"config/roles", RoleCatalogViewSet, basename="config-role")
router.register(r"config/system-settings", SystemSettingViewSet, basename="config-system-setting")
router.register(r"config/user-preferences", UserPreferenceViewSet, basename="config-user-preference")
router.register(r"config/user-role-assignments", UserRoleAssignmentViewSet, basename="config-user-role-assignment")
router.register(r"config/email-inboxes", OrganizationEmailInboxViewSet, basename="config-email-inbox")
router.register(r"system-admin/users", SystemAdminUserViewSet, basename="system-admin-user")
router.register(r"system-admin/memberships", SystemAdminMembershipViewSet, basename="system-admin-membership")
router.register(r"system-admin/organizations", SystemAdminOrganizationViewSet, basename="system-admin-organization")
router.register(r"system-admin/modules", SaaSModuleViewSet, basename="system-admin-module")
router.register(r"system-admin/plans", SaaSPlanViewSet, basename="system-admin-plan")
router.register(r"system-admin/plan-modules", SaaSPlanModuleViewSet, basename="system-admin-plan-module")
router.register(r"system-admin/subscriptions", SubscriptionViewSet, basename="system-admin-subscription")
router.register(r"system-admin/subscription-modules", SubscriptionModuleViewSet, basename="system-admin-subscription-module")
router.register(r"system-admin/feature-flags", OrganizationFeatureFlagViewSet, basename="system-admin-feature-flag")

urlpatterns = [
    path("config/organization-collaborators/", OrganizationCollaboratorView.as_view(), name="config-organization-collaborators"),
    path("system-admin/overview/", SystemAdminOverviewView.as_view(), name="system-admin-overview"),
    path("", include(router.urls)),
]
