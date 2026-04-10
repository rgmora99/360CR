from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.configuration.views import (
    ConfigurationUserViewSet,
    OrganizationCollaboratorView,
    RoleCatalogViewSet,
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

urlpatterns = [
    path("config/organization-collaborators/", OrganizationCollaboratorView.as_view(), name="config-organization-collaborators"),
    path("", include(router.urls)),
]
