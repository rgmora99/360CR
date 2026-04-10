from django.urls import path

from apps.core.views import ActivatePasswordView, LoginView, LogoutView, RegisterView, SessionView

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/activate-password/", ActivatePasswordView.as_view(), name="auth-activate-password"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/session/", SessionView.as_view(), name="auth-session"),
]
