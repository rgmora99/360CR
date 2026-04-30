import json
import logging
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agenda.models import AgendaEvent
from apps.core.models import PadronRecord, UserProfile
from apps.customers.models import Customer
from apps.finance.models import Invoice, InvoiceReceivablePayment, Purchase
from apps.loyalty.models import LoyaltyPointEntry, LoyaltyRedemption
from apps.suppliers.models import Supplier
from apps.configuration.models import UserRoleAssignment
from apps.tenants.models import Membership, Organization, SaaSModule, SaaSPlan, Subscription, SubscriptionModule

logger = logging.getLogger(__name__)

PERMISSION_MODULE_MAP = {
    "approvals.high": ["dashboard"],
    "customers.read": ["customers"],
    "customers.manage": ["customers"],
    "dashboards.executive": ["dashboard"],
    "invoices.manage": ["billing_basic"],
    "credit.manage": ["receivables"],
    "inventory.manage": ["inventory"],
    "operations.kpi": ["dashboard", "inventory"],
    "reports.finance": ["billing_basic", "receivables"],
    "reports.read": ["dashboard"],
    "suppliers.manage": ["suppliers", "purchases"],
    "suppliers.read": ["suppliers"],
    "tickets.manage": ["dashboard"],
    "users.lock": ["multiuser_permissions"],
    "users.read": ["multiuser_permissions"],
    "users.update": ["multiuser_permissions"],
    "security.manage": ["multiuser_permissions"],
    "audit.read": ["audit"],
}


def get_module_codes_for_permissions(permissions):
    permission_set = set(permissions or [])
    if "*" in permission_set:
        return {"*"}

    module_codes = set()
    for permission in permission_set:
        module_codes.update(PERMISSION_MODULE_MAP.get(permission, []))
    return module_codes


def build_unique_organization_slug(name):
    base_slug = slugify(name) or "organizacion"
    slug = base_slug
    suffix = 1
    while Organization.objects.filter(slug=slug).exists():
        suffix += 1
        slug = f"{base_slug}-{suffix}"
    return slug


def get_next_organization_hacienda_codes():
    last_org = (
        Organization.objects.order_by("-hacienda_branch_code", "-hacienda_terminal_code")
        .values("hacienda_branch_code", "hacienda_terminal_code")
        .first()
    )

    if not last_org:
        return "001", "00001"

    branch = int(last_org["hacienda_branch_code"] or "1")
    terminal = int(last_org["hacienda_terminal_code"] or "1") + 1

    if terminal > 99999:
        branch += 1
        terminal = 1

    while branch <= 999:
        branch_code = f"{branch:03d}"
        terminal_code = f"{terminal:05d}"
        exists = Organization.objects.filter(
            hacienda_branch_code=branch_code,
            hacienda_terminal_code=terminal_code,
        ).exists()
        if not exists:
            return branch_code, terminal_code

        terminal += 1
        if terminal > 99999:
            branch += 1
            terminal = 1

    raise ValueError("No hay codigos de sucursal/terminal disponibles para nuevas organizaciones.")


def sync_subscription_modules(subscription):
    if not subscription.plan_catalog_id:
        return

    included_module_ids = list(
        subscription.plan_catalog.plan_modules.filter(is_included=True).values_list("module_id", flat=True)
    )
    SubscriptionModule.objects.filter(subscription=subscription, source="plan").exclude(module_id__in=included_module_ids).delete()
    current_ids = set(subscription.subscription_modules.values_list("module_id", flat=True))
    for module_id in included_module_ids:
        if module_id in current_ids:
            continue
        SubscriptionModule.objects.create(subscription=subscription, module_id=module_id, source="plan", is_enabled=True)


def build_session_payload(user):
    is_system_owner = bool(user.is_superuser or user.is_staff)
    memberships = list(Membership.objects.select_related("organization").filter(user=user))
    membership_by_org_id = {membership.organization_id: membership for membership in memberships}
    system_owner_module_codes = []
    if is_system_owner:
        organizations_queryset = Organization.objects.all().order_by("name")
        organization_ids = list(organizations_queryset.values_list("id", flat=True))
        mapped_module_codes = {
            module_code
            for module_codes in PERMISSION_MODULE_MAP.values()
            for module_code in module_codes
        }
        system_owner_module_codes = sorted(
            set(SaaSModule.objects.filter(is_active=True).values_list("code", flat=True)).union(mapped_module_codes)
        )
    else:
        organizations_queryset = [membership.organization for membership in memberships if membership.organization.is_active]
        organization_ids = [membership.organization_id for membership in memberships if membership.organization.is_active]

    module_map = {}
    if organization_ids:
        module_rows = (
            SubscriptionModule.objects.filter(subscription__organization_id__in=organization_ids, is_enabled=True)
            .select_related("module", "subscription__organization")
            .values("subscription__organization_id", "module__code")
        )
        for row in module_rows:
            module_map.setdefault(row["subscription__organization_id"], []).append(row["module__code"])

    role_map = {}
    if organization_ids:
        role_rows = (
            UserRoleAssignment.objects.filter(
                user=user,
                organization_id__in=organization_ids,
                is_active=True,
                role__is_active=True,
            )
            .select_related("role")
            .values(
                "organization_id",
                "role__code",
                "role__name",
                "role__default_permissions",
            )
        )
        for row in role_rows:
            role_map.setdefault(row["organization_id"], []).append(
                {
                    "code": row["role__code"],
                    "name": row["role__name"],
                    "permissions": row["role__default_permissions"] or [],
                }
            )

    def get_effective_modules(organization, membership):
        subscribed_modules = set(module_map.get(organization.id, []))
        if is_system_owner:
            return system_owner_module_codes
        if membership and membership.role in [Membership.ROLE_OWNER, Membership.ROLE_ADMIN]:
            return sorted(subscribed_modules)

        assigned_roles = role_map.get(organization.id, [])
        if not assigned_roles:
            return []

        allowed_modules = set()
        for role in assigned_roles:
            role_modules = get_module_codes_for_permissions(role["permissions"])
            if "*" in role_modules:
                return sorted(subscribed_modules)
            allowed_modules.update(role_modules)

        return sorted(subscribed_modules.intersection(allowed_modules))

    organizations = []
    for organization in organizations_queryset:
        membership = membership_by_org_id.get(organization.id)
        organizations.append(
            {
                "id": organization.id,
                "name": organization.name,
                "is_active": organization.is_active,
                "parent_organization": organization.parent_organization_id,
                "membership_role": membership.role if membership else (Membership.ROLE_OWNER if is_system_owner else ""),
                "available_modules": system_owner_module_codes if is_system_owner else sorted(module_map.get(organization.id, [])),
                "active_modules": get_effective_modules(organization, membership),
                "assigned_roles": role_map.get(organization.id, []),
                "system_owner_scope": bool(is_system_owner and not membership),
            }
        )
    active_id = next(
        (org["id"] for org in organizations if org["is_active"] and org["parent_organization"] is None),
        next((org["id"] for org in organizations if org["is_active"]), organizations[0]["id"] if organizations else None),
    )
    profile = getattr(user, "profile", None)
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": profile.phone if profile else "",
            "is_system_owner": is_system_owner,
        },
        "organizations": organizations,
        "active_organization_id": active_id,
    }


def upsert_user_profile(user, phone="", google_sub="", google_email_verified=None):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    updated_fields = []

    cleaned_phone = (phone or "").strip()
    if cleaned_phone != profile.phone:
        profile.phone = cleaned_phone
        updated_fields.append("phone")

    cleaned_google_sub = (google_sub or "").strip() or None
    if cleaned_google_sub != profile.google_sub:
        profile.google_sub = cleaned_google_sub
        updated_fields.append("google_sub")

    if google_email_verified is not None and bool(google_email_verified) != profile.google_email_verified:
        profile.google_email_verified = bool(google_email_verified)
        updated_fields.append("google_email_verified")

    if updated_fields:
        profile.save(update_fields=[*updated_fields, "updated_at"])

    return profile


def verify_google_token(credential):
    client_id = settings.GOOGLE_CLIENT_ID
    if not client_id:
        raise ValueError("El acceso con Google no esta configurado en este entorno.")

    token = (credential or "").strip()
    if not token:
        raise ValueError("No se recibio la credencial de Google.")

    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(token)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        logger.warning("Token de Google invalido: %s", detail)
        raise ValueError("La sesion de Google no pudo verificarse.") from exc
    except Exception as exc:
        logger.exception("No se pudo validar el token de Google.")
        raise ValueError("No fue posible validar la cuenta de Google en este momento.") from exc

    if payload.get("aud") != client_id:
        raise ValueError("La credencial de Google no corresponde a esta aplicacion.")

    if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("El emisor de la cuenta de Google no es valido.")

    if payload.get("email_verified") not in {"true", True}:
        raise ValueError("La cuenta de Google debe tener el correo verificado.")

    return payload


def register_organization_for_user(user, business):
    slug = build_unique_organization_slug(business)
    branch_code, terminal_code = get_next_organization_hacienda_codes()
    organization = Organization.objects.create(
        name=business,
        slug=slug,
        hacienda_branch_code=branch_code,
        hacienda_terminal_code=terminal_code,
    )
    Membership.objects.get_or_create(
        user=user,
        organization=organization,
        defaults={"role": Membership.ROLE_OWNER},
    )
    base_plan = SaaSPlan.objects.filter(code="base", is_active=True).first()
    Subscription.objects.get_or_create(
        # Cada organizacion nueva arranca con el paquete base y queda lista para crecer por modulos.
        organization=organization,
        defaults={
            "plan": Subscription.PLAN_STARTER,
            "plan_catalog": base_plan,
            "status": Subscription.STATUS_TRIAL,
            "billing_cycle": Subscription.BILLING_MONTHLY,
            "base_price": getattr(base_plan, "monthly_price", 0) or 0,
        },
    )
    sync_subscription_modules(organization.subscription)
    return organization


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        business = (request.data.get("business") or "").strip()
        first_name = (request.data.get("first_name") or "").strip()
        last_name = (request.data.get("last_name") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        phone = (request.data.get("phone") or "").strip()
        password = request.data.get("password") or ""

        if not business or not first_name or not last_name or not email or len(password) < 8:
            return Response(
                {"detail": "Datos invalidos. Verifica negocio, nombre, apellidos, correo y contrasena minima de 8 caracteres."},
                status=400,
            )

        existing_user = User.objects.filter(username=email).first()
        user = existing_user

        if existing_user and Membership.objects.filter(user=existing_user).exists():
            return Response({"detail": "Ya existe una cuenta con ese correo."}, status=400)

        if existing_user:
            authenticated_user = authenticate(request, username=email, password=password)
            if not authenticated_user:
                return Response({"detail": "Ya existe una cuenta con ese correo."}, status=400)
            user = authenticated_user

        try:
            with transaction.atomic():
                if not user:
                    user = User.objects.create_user(
                        username=email,
                        email=email,
                        password=password,
                        first_name=first_name,
                        last_name=last_name,
                    )
                else:
                    user.first_name = first_name
                    user.last_name = last_name
                    user.email = email
                    user.save(update_fields=["first_name", "last_name", "email"])

                upsert_user_profile(user, phone=phone)
                register_organization_for_user(user, business)
        except IntegrityError:
            logger.exception("No se pudo completar el registro de %s por un conflicto de integridad.", email)
            return Response(
                {"detail": "No se pudo completar el registro. Intenta nuevamente en unos segundos."},
                status=409,
            )
        except ValueError as exc:
            logger.exception("No se pudo generar la organizacion inicial para %s.", email)
            return Response({"detail": str(exc)}, status=400)

        login(request, user)
        return Response(build_session_payload(user), status=status.HTTP_201_CREATED)


class GoogleAuthConfigView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"enabled": bool(settings.GOOGLE_CLIENT_ID), "client_id": settings.GOOGLE_CLIENT_ID})


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get("credential")
        business = (request.data.get("business") or "").strip()
        first_name = (request.data.get("first_name") or "").strip()
        last_name = (request.data.get("last_name") or "").strip()
        phone = (request.data.get("phone") or "").strip()

        try:
            google_payload = verify_google_token(credential)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        email = (google_payload.get("email") or "").strip().lower()
        google_sub = (google_payload.get("sub") or "").strip()
        google_first_name = (google_payload.get("given_name") or "").strip()
        google_last_name = (google_payload.get("family_name") or "").strip()

        if not email or not google_sub:
            return Response({"detail": "La cuenta de Google no proporciono un correo valido."}, status=400)

        user = User.objects.filter(username=email).first()
        memberships_exist = Membership.objects.filter(user=user).exists() if user else False

        if not user and not business:
            return Response({"detail": "Para registrarte con Google debes indicar el nombre del negocio."}, status=400)

        if user and not memberships_exist and not business:
            return Response({"detail": "Completa el nombre del negocio para terminar de activar tu cuenta."}, status=400)

        try:
            with transaction.atomic():
                if not user:
                    user = User.objects.create_user(
                        username=email,
                        email=email,
                        password=None,
                        first_name=first_name or google_first_name,
                        last_name=last_name or google_last_name,
                    )
                    user.set_unusable_password()
                    user.save(update_fields=["password"])
                else:
                    updated_fields = []
                    resolved_first_name = first_name or google_first_name
                    resolved_last_name = last_name or google_last_name
                    if resolved_first_name and user.first_name != resolved_first_name:
                        user.first_name = resolved_first_name
                        updated_fields.append("first_name")
                    if resolved_last_name and user.last_name != resolved_last_name:
                        user.last_name = resolved_last_name
                        updated_fields.append("last_name")
                    if user.email != email:
                        user.email = email
                        updated_fields.append("email")
                    if updated_fields:
                        user.save(update_fields=updated_fields)

                upsert_user_profile(
                    user,
                    phone=phone,
                    google_sub=google_sub,
                    google_email_verified=True,
                )

                if business and not memberships_exist:
                    register_organization_for_user(user, business)
        except IntegrityError:
            logger.exception("No se pudo completar la autenticacion Google de %s.", email)
            return Response({"detail": "No se pudo completar el acceso con Google."}, status=409)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        if not (user.is_superuser or user.is_staff) and not Membership.objects.filter(user=user).exists():
            return Response({"detail": "Tu cuenta no tiene una organizacion activa. Registrate con el nombre del negocio para continuar."}, status=400)

        login(request, user)
        return Response(build_session_payload(user), status=200)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        existing_user = User.objects.filter(username=email).first()
        if existing_user and not existing_user.has_usable_password():
            return Response(
                {
                    "detail": "Tu cuenta aun no tiene contrasena. Debes crearla para ingresar.",
                    "code": "password_setup_required",
                    "setup_email": existing_user.email,
                },
                status=428,
            )

        user = authenticate(request, username=email, password=password)
        if not user:
            return Response({"detail": "Credenciales invalidas."}, status=400)

        login(request, user)
        return Response(build_session_payload(user))


class ActivatePasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        new_password = request.data.get("new_password") or ""

        if not email or len(new_password) < 8:
            return Response({"detail": "Debes enviar correo y una contrasena de al menos 8 caracteres."}, status=400)

        user = User.objects.filter(username=email).first()
        if not user:
            return Response({"detail": "No existe una cuenta para ese correo."}, status=404)

        if user.has_usable_password():
            return Response({"detail": "La cuenta ya tiene contrasena configurada."}, status=400)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"detail": "Contrasena creada correctamente. Ya puedes iniciar sesion."}, status=200)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=204)


class SessionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_session_payload(request.user))


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_organization_id = request.query_params.get("organization_id")
        try:
            organization_id = int(raw_organization_id)
        except (TypeError, ValueError):
            return Response({"detail": "organization_id es requerido y debe ser numerico."}, status=400)

        has_access = Membership.objects.filter(user=request.user, organization_id=organization_id).exists()
        if not has_access:
            return Response({"detail": "No tiene acceso a la organizacion seleccionada."}, status=403)

        today = timezone.localdate()
        start_today = timezone.make_aware(datetime.combine(today, time.min))
        end_today = start_today + timedelta(days=1)
        start_last_7 = start_today - timedelta(days=7)
        start_prev_7 = start_today - timedelta(days=14)

        invoices_today_qs = Invoice.objects.filter(
            organization_id=organization_id,
            status=Invoice.STATUS_ISSUED,
            issue_date__gte=start_today,
            issue_date__lt=end_today,
        )
        purchases_today_qs = Purchase.objects.filter(
            organization_id=organization_id,
            created_at__gte=start_today,
            created_at__lt=end_today,
        )
        customers_today_qs = Customer.objects.filter(
            organization_id=organization_id,
            created_at__gte=start_today,
            created_at__lt=end_today,
        )
        agenda_today_qs = AgendaEvent.objects.filter(
            organization_id=organization_id,
            starts_at__gte=start_today,
            starts_at__lt=end_today,
        )

        invoices_last_7_total = (
            Invoice.objects.filter(
                organization_id=organization_id,
                status=Invoice.STATUS_ISSUED,
                issue_date__gte=start_last_7,
                issue_date__lt=end_today,
            ).aggregate(total=Sum("total")).get("total")
            or Decimal("0.00")
        )
        invoices_prev_7_total = (
            Invoice.objects.filter(
                organization_id=organization_id,
                status=Invoice.STATUS_ISSUED,
                issue_date__gte=start_prev_7,
                issue_date__lt=start_last_7,
            ).aggregate(total=Sum("total")).get("total")
            or Decimal("0.00")
        )

        weekly_progress_percent = Decimal("100.00")
        if invoices_prev_7_total > Decimal("0.00"):
            weekly_progress_percent = (invoices_last_7_total / invoices_prev_7_total) * Decimal("100")
        weekly_progress_percent = max(Decimal("0.00"), min(weekly_progress_percent, Decimal("100.00")))

        weekly_change_percent = Decimal("0.00")
        if invoices_prev_7_total > Decimal("0.00"):
            weekly_change_percent = ((invoices_last_7_total - invoices_prev_7_total) / invoices_prev_7_total) * Decimal("100")
        elif invoices_last_7_total > Decimal("0.00"):
            weekly_change_percent = Decimal("100.00")

        recent_activity = []

        for invoice in Invoice.objects.filter(organization_id=organization_id).select_related("customer").order_by("-issue_date")[:4]:
            recent_activity.append(
                {
                    "timestamp": invoice.issue_date,
                    "title": f"Factura {invoice.invoice_number}",
                    "description": f"{invoice.customer.legal_name} · Total {invoice.total} {invoice.currency}",
                    "module": "Facturacion",
                }
            )

        for event in AgendaEvent.objects.filter(organization_id=organization_id).select_related("customer").order_by("-created_at")[:4]:
            recent_activity.append(
                {
                    "timestamp": event.created_at,
                    "title": event.title,
                    "description": event.customer.legal_name if event.customer_id else "Evento sin cliente asociado",
                    "module": "Agenda",
                }
            )

        for customer in Customer.objects.filter(organization_id=organization_id).order_by("-created_at")[:4]:
            recent_activity.append(
                {
                    "timestamp": customer.created_at,
                    "title": f"Cliente {customer.legal_name}",
                    "description": "Registro o actualizacion reciente de cliente",
                    "module": "Clientes",
                }
            )

        for purchase in Purchase.objects.filter(organization_id=organization_id).order_by("-created_at")[:4]:
            recent_activity.append(
                {
                    "timestamp": purchase.created_at,
                    "title": f"Compra {purchase.invoice_number}",
                    "description": f"{purchase.supplier_name} · Total {purchase.total} {purchase.currency}",
                    "module": "Compras",
                }
            )

        for supplier in Supplier.objects.filter(organization_id=organization_id).order_by("-created_at")[:4]:
            recent_activity.append(
                {
                    "timestamp": supplier.created_at,
                    "title": f"Proveedor {supplier.legal_name}",
                    "description": "Alta o actualizacion reciente de proveedor",
                    "module": "Proveedores",
                }
            )

        for payment in (
            InvoiceReceivablePayment.objects.filter(invoice__organization_id=organization_id)
            .select_related("invoice", "invoice__customer")
            .order_by("-created_at")[:4]
        ):
            recent_activity.append(
                {
                    "timestamp": payment.created_at,
                    "title": f"Abono aplicado a {payment.invoice.invoice_number}",
                    "description": f"{payment.invoice.customer.legal_name} · Monto {payment.amount}",
                    "module": "Cuentas por cobrar",
                }
            )

        for redemption in (
            LoyaltyRedemption.objects.filter(program__organization_id=organization_id)
            .select_related("member__customer", "reward")
            .order_by("-requested_at")[:4]
        ):
            recent_activity.append(
                {
                    "timestamp": redemption.requested_at,
                    "title": f"Canje {redemption.reward.name}",
                    "description": f"{redemption.member.customer.legal_name} · {redemption.points_spent} pts",
                    "module": "Fidelizacion",
                }
            )

        for point_entry in (
            LoyaltyPointEntry.objects.filter(program__organization_id=organization_id, source_reference__gt="")
            .select_related("member__customer")
            .order_by("-event_at")[:4]
        ):
            recent_activity.append(
                {
                    "timestamp": point_entry.event_at,
                    "title": f"Movimiento de puntos {point_entry.entry_type}",
                    "description": f"{point_entry.member.customer.legal_name} · Ref {point_entry.source_reference}",
                    "module": "Fidelizacion",
                }
            )

        for invoice in (
            Invoice.objects.filter(organization_id=organization_id, email_sent_at__isnull=False)
            .select_related("customer")
            .order_by("-email_sent_at")[:4]
        ):
            recent_activity.append(
                {
                    "timestamp": invoice.email_sent_at,
                    "title": f"Factura enviada {invoice.invoice_number}",
                    "description": f"{invoice.customer.legal_name} · correo enviado",
                    "module": "Facturacion",
                }
            )

        recent_activity.sort(key=lambda item: item["timestamp"], reverse=True)
        recent_activity = recent_activity[:3]

        return Response(
            {
                "summary": {
                    "sales_today_total": invoices_today_qs.aggregate(total=Sum("total")).get("total") or Decimal("0.00"),
                    "sales_today_count": invoices_today_qs.count(),
                    "new_customers_today": customers_today_qs.count(),
                    "pending_events_today": agenda_today_qs.exclude(status=AgendaEvent.STATUS_DONE).exclude(status=AgendaEvent.STATUS_CANCELLED).count(),
                    "purchases_today_count": purchases_today_qs.count(),
                    "weekly_sales_total": invoices_last_7_total,
                    "weekly_change_percent": weekly_change_percent.quantize(Decimal("0.01")),
                    "weekly_progress_percent": weekly_progress_percent.quantize(Decimal("0.01")),
                },
                "recent_activity": recent_activity,
            }
        )


class PadronLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_cedula = request.query_params.get("cedula", "")
        cedula = re.sub(r"\D", "", raw_cedula or "")
        logger.info("PadronLookupView request", extra={"user_id": request.user.id, "raw_cedula": raw_cedula, "cedula": cedula})
        if len(cedula) != 9:
            logger.warning("PadronLookupView invalid cedula length", extra={"user_id": request.user.id, "cedula": cedula})
            return Response({"detail": "La cedula debe tener 9 digitos.", "found": False}, status=400)

        record = PadronRecord.objects.filter(cedula=cedula).only("cedula", "full_name", "normalized_name").first()
        if not record:
            logger.info("PadronLookupView cedula not found", extra={"user_id": request.user.id, "cedula": cedula})
            return Response(
                {
                    "detail": "La cedula no existe en el padron electoral.",
                    "found": False,
                    "cedula": cedula,
                },
                status=200,
            )

        normalized_name = record.normalized_name or unicodedata.normalize("NFD", record.full_name).encode("ascii", "ignore").decode("ascii").lower()
        logger.info("PadronLookupView cedula found", extra={"user_id": request.user.id, "cedula": cedula})
        return Response(
            {
                "found": True,
                "cedula": record.cedula,
                "full_name": record.full_name,
                "normalized_name": normalized_name,
            },
            status=200,
        )
