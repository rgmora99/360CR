import re
import unicodedata
import logging
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.core.models import PadronRecord
from apps.customers.models import Customer
from apps.finance.models import Invoice, InvoiceReceivablePayment, Purchase
from apps.agenda.models import AgendaEvent
from apps.loyalty.models import LoyaltyPointEntry, LoyaltyRedemption
from apps.suppliers.models import Supplier
from apps.tenants.models import Membership, Organization

logger = logging.getLogger(__name__)


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

    raise ValueError("No hay códigos de sucursal/terminal disponibles para nuevas organizaciones.")


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        business = (request.data.get("business") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""

        if not business or not email or len(password) < 8:
            return Response({"detail": "Datos inválidos. Verifique negocio, correo y contraseña mínima de 8 caracteres."}, status=400)

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
                    user = User.objects.create_user(username=email, email=email, password=password)

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
        except IntegrityError:
            logger.exception("No se pudo completar el registro de %s por un conflicto de integridad.", email)
            return Response(
                {"detail": "No se pudo completar el registro. Intenta nuevamente en unos segundos."},
                status=409,
            )
        except ValueError as exc:
            logger.exception("No se pudo generar la organización inicial para %s.", email)
            return Response({"detail": str(exc)}, status=400)

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


class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_organization_id = request.query_params.get("organization_id")
        try:
            organization_id = int(raw_organization_id)
        except (TypeError, ValueError):
            return Response({"detail": "organization_id es requerido y debe ser numérico."}, status=400)

        has_access = Membership.objects.filter(user=request.user, organization_id=organization_id).exists()
        if not has_access:
            return Response({"detail": "No tiene acceso a la organización seleccionada."}, status=403)

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
                    "module": "Facturación",
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
                    "description": "Registro o actualización reciente de cliente",
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
                    "description": "Alta o actualización reciente de proveedor",
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
                    "module": "Fidelización",
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
                    "module": "Fidelización",
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
                    "module": "Facturación",
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
            return Response({"detail": "La cédula debe tener 9 dígitos.", "found": False}, status=400)

        record = PadronRecord.objects.filter(cedula=cedula).only("cedula", "full_name", "normalized_name").first()
        if not record:
            logger.info("PadronLookupView cedula not found", extra={"user_id": request.user.id, "cedula": cedula})
            return Response(
                {
                    "detail": "La cédula no existe en el padrón electoral.",
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
