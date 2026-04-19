from django.urls import path

from apps.core.views import (
    ActivatePasswordView,
    DashboardSummaryView,
    GoogleAuthConfigView,
    GoogleAuthView,
    LoginView,
    LogoutView,
    PadronLookupView,
    RegisterView,
    SessionView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/google/", GoogleAuthView.as_view(), name="auth-google"),
    path("auth/google/config/", GoogleAuthConfigView.as_view(), name="auth-google-config"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/activate-password/", ActivatePasswordView.as_view(), name="auth-activate-password"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/session/", SessionView.as_view(), name="auth-session"),
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("padron/lookup/", PadronLookupView.as_view(), name="padron-lookup"),
]
