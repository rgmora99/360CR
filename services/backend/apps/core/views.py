from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.tenants.models import Membership, Organization


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        business = (request.data.get("business") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""

        if not business or not email or len(password) < 8:
            return Response({"detail": "Datos inválidos. Verifique negocio, correo y contraseña mínima de 8 caracteres."}, status=400)

        if User.objects.filter(username=email).exists():
            return Response({"detail": "Ya existe una cuenta con ese correo."}, status=400)

        user = User.objects.create_user(username=email, email=email, password=password)

        base_slug = slugify(business) or "organizacion"
        slug = base_slug
        suffix = 1
        while Organization.objects.filter(slug=slug).exists():
            suffix += 1
            slug = f"{base_slug}-{suffix}"

        organization = Organization.objects.create(name=business, slug=slug)
        Membership.objects.create(user=user, organization=organization, role=Membership.ROLE_OWNER)

        login(request, user)
        return Response(
            {
                "user": {"id": user.id, "email": user.email},
                "organizations": [{"id": organization.id, "name": organization.name, "parent_organization": None}],
                "active_organization_id": organization.id,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        existing_user = User.objects.filter(username=email).first()
        if existing_user and not existing_user.has_usable_password():
            return Response(
                {
                    "detail": "Tu cuenta aún no tiene contraseña. Debes crearla para ingresar.",
                    "code": "password_setup_required",
                    "setup_email": existing_user.email,
                },
                status=428,
            )

        user = authenticate(request, username=email, password=password)
        if not user:
            return Response({"detail": "Credenciales inválidas."}, status=400)

        login(request, user)
        memberships = Membership.objects.select_related("organization").filter(user=user)
        organizations = [
            {
                "id": m.organization.id,
                "name": m.organization.name,
                "parent_organization": m.organization.parent_organization_id,
            }
            for m in memberships
        ]
        active_id = next((org["id"] for org in organizations if org["parent_organization"] is None), organizations[0]["id"] if organizations else None)
        return Response({"user": {"id": user.id, "email": user.email}, "organizations": organizations, "active_organization_id": active_id})


class ActivatePasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        new_password = request.data.get("new_password") or ""

        if not email or len(new_password) < 8:
            return Response({"detail": "Debes enviar correo y una contraseña de al menos 8 caracteres."}, status=400)

        user = User.objects.filter(username=email).first()
        if not user:
            return Response({"detail": "No existe una cuenta para ese correo."}, status=404)

        if user.has_usable_password():
            return Response({"detail": "La cuenta ya tiene contraseña configurada."}, status=400)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Contraseña creada correctamente. Ya puedes iniciar sesión."}, status=200)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=204)


class SessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.select_related("organization").filter(user=request.user)
        organizations = [
            {
                "id": m.organization.id,
                "name": m.organization.name,
                "parent_organization": m.organization.parent_organization_id,
            }
            for m in memberships
        ]
        active_id = next((org["id"] for org in organizations if org["parent_organization"] is None), organizations[0]["id"] if organizations else None)
        return Response({"user": {"id": request.user.id, "email": request.user.email}, "organizations": organizations, "active_organization_id": active_id})
