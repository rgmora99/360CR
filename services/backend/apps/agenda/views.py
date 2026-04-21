from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.agenda.models import AgendaEvent, AgendaEventType, CollaboratorAvailability, agenda_weekday_for_date
from apps.agenda.serializers import AgendaEventSerializer, AgendaEventTypeSerializer, CollaboratorAvailabilitySerializer
from apps.customers.models import Customer, CustomerType
from apps.customers.serializers import CustomerSerializer
from apps.finance.models import Product
from apps.tenants.access import OrganizationScopedViewMixin
from apps.tenants.models import Membership, Organization


User = get_user_model()


def _collaborator_public_label(collaborator):
    if not collaborator:
        return "Especialista por confirmar"
    full_name = f"{(collaborator.first_name or '').strip()} {(collaborator.last_name or '').strip()}".strip()
    return full_name or "Especialista asignado"


def _build_available_slots(day, availability, occupied_events, duration_minutes, step_minutes, tz):
    if not availability or not availability.is_active or duration_minutes <= 0 or step_minutes <= 0:
        return []

    schedule_start = timezone.make_aware(datetime.combine(day, availability.start_time), tz)
    schedule_end = timezone.make_aware(datetime.combine(day, availability.end_time), tz)
    duration = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=step_minutes)
    current_start = schedule_start
    slots = []

    while current_start + duration <= schedule_end:
        current_end = current_start + duration
        has_conflict = any(item["starts_at"] < current_end and item["ends_at"] > current_start for item in occupied_events)
        if not has_conflict:
            slots.append(
                {
                    "start_time": current_start.strftime("%H:%M"),
                    "end_time": current_end.strftime("%H:%M"),
                    "starts_at": current_start.isoformat(),
                    "ends_at": current_end.isoformat(),
                }
            )
        current_start += step

    return slots


def _get_slot_step_minutes(organization):
    durations = list(
        Product.objects.filter(
            organization=organization,
            product_type=Product.TYPE_SERVICE,
            is_active=True,
            service_duration_minutes__gt=0,
        )
        .values_list("service_duration_minutes", flat=True)
    )
    if not durations:
        return 30

    normalized = sorted({int(value) for value in durations if int(value) > 0})
    if not normalized:
        return 30

    step = normalized[0]
    for value in normalized[1:]:
        while value:
            step, value = value, step % value

    return max(15, step if step > 0 else 30)


class AgendaEventTypeViewSet(viewsets.ModelViewSet):
    queryset = AgendaEventType.objects.all()
    serializer_class = AgendaEventTypeSerializer
    permission_classes = [IsAuthenticated]


class CollaboratorAvailabilityViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = CollaboratorAvailabilitySerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization",)

    def get_queryset(self):
        queryset = CollaboratorAvailability.objects.select_related("organization", "collaborator")
        return self.scope_queryset(queryset)


class AgendaEventViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = AgendaEventSerializer
    permission_classes = [IsAuthenticated]
    tenant_access_paths = ("organization", "service.organization_id", "customer.organization_id", "supplier.organization_id")

    def get_permissions(self):
        if self.action in {
            "availability",
            "self_book",
            "self_book_context",
            "self_book_customer",
            "self_book_lookup",
            "self_book_cancel",
            "self_book_reschedule",
        }:
            return [AllowAny()]
        return [permission() for permission in self.permission_classes]

    def get_queryset(self):
        queryset = AgendaEvent.objects.select_related(
            "organization",
            "event_type",
            "service",
            "collaborator",
            "customer",
            "supplier",
        ).all()

        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        service_id = self.request.query_params.get("service_id")
        if service_id:
            queryset = queryset.filter(service_id=service_id)

        collaborator_id = self.request.query_params.get("collaborator_id")
        if collaborator_id:
            queryset = queryset.filter(collaborator_id=collaborator_id)

        date_from = self.request.query_params.get("date_from")
        if date_from:
            parsed_date_from = parse_datetime(date_from)
            if parsed_date_from:
                queryset = queryset.filter(starts_at__gte=parsed_date_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            parsed_date_to = parse_datetime(date_to)
            if parsed_date_to:
                queryset = queryset.filter(starts_at__lte=parsed_date_to)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))

        return self.scope_queryset(queryset)

    def _get_public_appointment(self, reference, access_code):
        normalized_reference = str(reference or "").strip().upper()
        normalized_access_code = str(access_code or "").strip().upper()
        if not normalized_reference:
            raise ValueError("reference es requerido")
        if not normalized_access_code:
            raise ValueError("access_code es requerido")

        appointment = (
            AgendaEvent.objects.select_related("service", "collaborator", "customer")
            .filter(public_reference=normalized_reference)
            .first()
        )
        if not appointment or not appointment.verify_public_access_code(normalized_access_code):
            raise LookupError("No pudimos validar la referencia y el código de acceso.")
        return appointment

    def _serialize_public_appointment(self, appointment, include_manage_credentials=False, access_code=""):
        now = timezone.now()
        can_manage = bool(appointment.starts_at and appointment.starts_at >= now and appointment.status == AgendaEvent.STATUS_PENDING)
        payload = {
            "id": appointment.id,
            "reference": appointment.public_reference,
            "title": appointment.title,
            "service": appointment.service_id,
            "service_name": getattr(appointment.service, "name", "") or appointment.title,
            "collaborator": appointment.collaborator_id,
            "collaborator_label": _collaborator_public_label(appointment.collaborator),
            "starts_at": appointment.starts_at,
            "ends_at": appointment.ends_at,
            "status": appointment.status,
            "status_display": appointment.get_status_display(),
            "is_upcoming": bool(appointment.starts_at and appointment.starts_at >= now),
            "can_cancel": can_manage,
            "can_reschedule": can_manage,
        }
        if include_manage_credentials:
            payload["manage_credentials"] = {
                "reference": appointment.public_reference,
                "access_code": access_code,
            }
        return payload

    @action(detail=False, methods=["get"], url_path="collaborators")
    def collaborators(self, request):
        organization_id = request.query_params.get("organization_id")
        if not organization_id:
            return Response({"detail": "organization_id es requerido"}, status=400)
        try:
            organization_id_int = int(organization_id)
        except (TypeError, ValueError):
            return Response({"detail": "organization_id inválido"}, status=400)

        self.validate_organization_payload(organization_id_int)
        memberships = Membership.objects.select_related("user").filter(organization_id=organization_id_int)
        data = [{"id": m.user_id, "email": m.user.email, "role": m.role} for m in memberships]
        return Response(data)

    @action(detail=False, methods=["get"], url_path="availability")
    def availability(self, request):
        organization_id = request.query_params.get("organization_id")
        collaborator_id = request.query_params.get("collaborator_id")
        date_value = request.query_params.get("date")
        service_id = request.query_params.get("service_id")
        exclude_event_id = request.query_params.get("exclude_event_id")

        if not organization_id or not collaborator_id or not date_value:
            return Response({"detail": "organization_id, collaborator_id y date son requeridos."}, status=400)

        try:
            organization = Organization.objects.get(id=int(organization_id))
            collaborator = User.objects.get(id=int(collaborator_id))
        except (TypeError, ValueError, Organization.DoesNotExist, User.DoesNotExist):
            return Response({"detail": "Parámetros inválidos."}, status=400)

        day = parse_date(date_value)
        if not day:
            return Response({"detail": "date inválida. Use formato YYYY-MM-DD."}, status=400)

        service = None
        duration_minutes = 0
        slot_step_minutes = _get_slot_step_minutes(organization)
        if service_id:
            try:
                service = Product.objects.get(
                    id=int(service_id),
                    organization=organization,
                    product_type=Product.TYPE_SERVICE,
                    is_active=True,
                )
            except (TypeError, ValueError, Product.DoesNotExist):
                return Response({"detail": "El servicio seleccionado no existe para esta organización."}, status=400)
            duration_minutes = int(service.service_duration_minutes or 0)
            if duration_minutes <= 0:
                duration_minutes = 30

        tz = timezone.get_current_timezone()
        start_of_day = timezone.make_aware(datetime.combine(day, datetime.min.time()), tz)
        end_of_day = start_of_day + timedelta(days=1)

        occupied_events = list(
            AgendaEvent.objects.filter(
                organization=organization,
                collaborator=collaborator,
                starts_at__lt=end_of_day,
                ends_at__gt=start_of_day,
            )
            .exclude(id=exclude_event_id) 
            .exclude(status=AgendaEvent.STATUS_CANCELLED)
            .order_by("starts_at")
            .values("starts_at", "ends_at")
        )
        weekday = agenda_weekday_for_date(day)
        availability = CollaboratorAvailability.objects.filter(
            organization=organization,
            collaborator=collaborator,
            weekday=weekday,
        ).first()

        requested_start = request.query_params.get("start_time")
        requested_end = request.query_params.get("end_time")
        slot_message = ""
        slot_is_available = True
        if requested_start and requested_end and availability:
            try:
                requested_start_time = datetime.strptime(requested_start, "%H:%M").time()
                requested_end_time = datetime.strptime(requested_end, "%H:%M").time()
            except ValueError:
                return Response({"detail": "start_time y end_time deben usar formato HH:MM."}, status=400)

            if not availability.is_active:
                slot_is_available = False
                slot_message = "El colaborador está bloqueado para ese día."
            elif requested_start_time < availability.start_time or requested_end_time > availability.end_time:
                slot_is_available = False
                slot_message = (
                    "La cita queda fuera del horario del colaborador. "
                    f"Horario permitido: {availability.start_time.strftime('%H:%M')} - {availability.end_time.strftime('%H:%M')}."
                )
            else:
                requested_start_at = timezone.make_aware(datetime.combine(day, requested_start_time), tz)
                requested_end_at = timezone.make_aware(datetime.combine(day, requested_end_time), tz)
                slot_conflicts = (
                    AgendaEvent.objects.filter(
                        organization=organization,
                        collaborator=collaborator,
                        starts_at__lt=requested_end_at,
                        ends_at__gt=requested_start_at,
                    )
                    .exclude(status=AgendaEvent.STATUS_CANCELLED)
                    .exists()
                )
                slot_is_available = not slot_conflicts
                slot_message = (
                    "Horario disponible para reservar."
                    if slot_is_available
                    else "Ya existe una cita que se cruza con ese horario."
                )
        elif requested_start and requested_end and not availability:
            slot_is_available = False
            slot_message = "El colaborador no tiene horario configurado para ese día."

        available_slots = _build_available_slots(
            day,
            availability,
            occupied_events,
            duration_minutes,
            slot_step_minutes,
            tz,
        )

        return Response(
            {
                "date": day.isoformat(),
                "schedule": (
                    {
                        "weekday": weekday,
                        "start_time": availability.start_time.strftime("%H:%M"),
                        "end_time": availability.end_time.strftime("%H:%M"),
                        "is_active": availability.is_active,
                    }
                    if availability
                    else None
                ),
                "service": (
                    {
                        "id": service.id,
                        "name": service.name,
                        "duration_minutes": duration_minutes,
                        "slot_step_minutes": slot_step_minutes,
                    }
                    if service
                    else None
                ),
                "available_slots": available_slots,
                "slot_available": slot_is_available,
                "slot_message": slot_message,
            }
        )

    @action(detail=False, methods=["post"], url_path="self-book")
    def self_book(self, request):
        required_fields = ["organization", "event_type", "service", "collaborator", "title", "starts_at"]
        missing = [field for field in required_fields if not request.data.get(field)]
        if missing:
            return Response({"detail": f"Campos requeridos faltantes: {', '.join(missing)}"}, status=400)

        try:
            service = Product.objects.get(id=int(request.data.get("service")), organization_id=int(request.data.get("organization")))
        except (TypeError, ValueError, Product.DoesNotExist):
            return Response({"detail": "El servicio seleccionado no existe para esta organización."}, status=400)

        starts_at = parse_datetime(str(request.data.get("starts_at")))
        if not starts_at:
            return Response({"detail": "starts_at inválido."}, status=400)

        duration_minutes = int(service.service_duration_minutes or 0)
        if duration_minutes <= 0:
            duration_minutes = 30
        payload = dict(request.data)
        payload["ends_at"] = (starts_at + timedelta(minutes=duration_minutes)).isoformat()

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        try:
            appointment = serializer.save(status=AgendaEvent.STATUS_PENDING)
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
            return Response(detail, status=400)
        access_code = appointment.issue_public_access_code()
        appointment.save(update_fields=["public_access_code_hash", "updated_at"])
        return Response(
            {
                "detail": "Cita agendada correctamente.",
                "appointment": self._serialize_public_appointment(
                    appointment,
                    include_manage_credentials=True,
                    access_code=access_code,
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="self-book-context")
    def self_book_context(self, request):
        organization_id = request.query_params.get("organization_id")
        if not organization_id:
            return Response({"detail": "organization_id es requerido"}, status=400)

        try:
            organization = Organization.objects.get(id=int(organization_id))
        except (TypeError, ValueError, Organization.DoesNotExist):
            return Response({"detail": "organization_id inválido"}, status=400)

        services = list(
            Product.objects.filter(organization=organization, product_type=Product.TYPE_SERVICE, is_active=True)
            .values("id", "name", "service_duration_minutes")
            .order_by("name")
        )

        collaborators = [
            {"id": membership.user_id, "label": _collaborator_public_label(membership.user)}
            for membership in Membership.objects.select_related("user").filter(organization=organization).order_by("user__first_name", "user__last_name", "user__email")
        ]

        cita_type = AgendaEventType.objects.filter(code="cita").first() or AgendaEventType.objects.first()
        if not cita_type:
            return Response({"detail": "No hay tipos de evento configurados."}, status=400)

        return Response(
            {
                "organization_id": organization.id,
                "organization_name": organization.name,
                "event_type_id": cita_type.id,
                "services": services,
                "collaborators": collaborators,
            }
        )

    @action(detail=False, methods=["post"], url_path="self-book-customer")
    def self_book_customer(self, request):
        organization_id = request.data.get("organization_id")
        tax_id = (request.data.get("tax_id") or "").strip()
        if not organization_id:
            return Response({"detail": "organization_id es requerido"}, status=400)
        if not tax_id:
            return Response({"detail": "tax_id es requerido"}, status=400)

        try:
            organization = Organization.objects.get(id=int(organization_id))
        except (TypeError, ValueError, Organization.DoesNotExist):
            return Response({"detail": "organization_id inválido"}, status=400)

        existing_customer = Customer.objects.filter(organization=organization, tax_id=tax_id).first()
        if existing_customer:
            updates = []
            incoming_email = (request.data.get("email") or "").strip()
            incoming_phone = (request.data.get("phone") or "").strip()
            if incoming_email and existing_customer.email != incoming_email:
                existing_customer.email = incoming_email
                updates.append("email")
            if incoming_phone and existing_customer.phone != incoming_phone:
                existing_customer.phone = incoming_phone
                updates.append("phone")
            if updates:
                existing_customer.save(update_fields=[*updates, "updated_at"])
            return Response(
                {
                    "created": False,
                    "customer": {
                        "id": existing_customer.id,
                        "legal_name": existing_customer.legal_name,
                        "tax_id": existing_customer.tax_id,
                    },
                }
            )

        legal_name = (request.data.get("legal_name") or "").strip()
        if not legal_name:
            return Response({"detail": "legal_name es requerido para crear el cliente."}, status=400)

        customer_type, _created = CustomerType.objects.get_or_create(code="general", defaults={"name": "General"})
        serializer = CustomerSerializer(
            data={
                "organization": organization.id,
                "customer_type": customer_type.id,
                "legal_name": legal_name,
                "trade_name": (request.data.get("trade_name") or "").strip(),
                "tax_id": tax_id,
                "email": (request.data.get("email") or "").strip(),
                "phone": (request.data.get("phone") or "").strip(),
                "status": Customer.STATUS_ACTIVE,
            }
        )
        serializer.is_valid(raise_exception=True)
        customer = serializer.save()
        return Response(
            {
                "created": True,
                "customer": {
                    "id": customer.id,
                    "legal_name": customer.legal_name,
                    "tax_id": customer.tax_id,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="self-book-lookup")
    def self_book_lookup(self, request):
        try:
            appointment = self._get_public_appointment(
                request.data.get("reference"),
                request.data.get("access_code"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=404)

        return Response({"appointment": self._serialize_public_appointment(appointment)})

    @action(detail=False, methods=["post"], url_path="self-book-cancel")
    def self_book_cancel(self, request):
        try:
            appointment = self._get_public_appointment(
                request.data.get("reference"),
                request.data.get("access_code"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=404)

        if appointment.status == AgendaEvent.STATUS_CANCELLED:
            return Response({"detail": "La cita ya estaba cancelada."}, status=400)
        if appointment.starts_at < timezone.now():
            return Response({"detail": "Solo puedes cancelar citas futuras."}, status=400)

        appointment.status = AgendaEvent.STATUS_CANCELLED
        appointment.save(update_fields=["status", "updated_at"])
        return Response(
            {
                "detail": "Cita cancelada correctamente.",
                "appointment": self._serialize_public_appointment(appointment),
            }
        )

    @action(detail=False, methods=["post"], url_path="self-book-reschedule")
    def self_book_reschedule(self, request):
        starts_at_raw = str(request.data.get("starts_at") or "")
        service_id = request.data.get("service")
        collaborator_id = request.data.get("collaborator")

        try:
            appointment = self._get_public_appointment(
                request.data.get("reference"),
                request.data.get("access_code"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=404)

        if appointment.status == AgendaEvent.STATUS_CANCELLED:
            return Response({"detail": "No se puede mover una cita cancelada."}, status=400)
        if appointment.starts_at < timezone.now():
            return Response({"detail": "Solo puedes mover citas futuras."}, status=400)

        starts_at = parse_datetime(starts_at_raw)
        if not starts_at:
            return Response({"detail": "starts_at inválido."}, status=400)

        service = appointment.service
        if service_id:
            try:
                service = Product.objects.get(
                    id=int(service_id),
                    organization=appointment.organization,
                    product_type=Product.TYPE_SERVICE,
                    is_active=True,
                )
            except (TypeError, ValueError, Product.DoesNotExist):
                return Response({"detail": "El servicio seleccionado no existe para esta organización."}, status=400)
        if not service:
            return Response({"detail": "La cita no tiene un servicio asociado."}, status=400)

        collaborator = appointment.collaborator
        if collaborator_id:
            try:
                collaborator = User.objects.get(id=int(collaborator_id))
            except (TypeError, ValueError, User.DoesNotExist):
                return Response({"detail": "El colaborador indicado no existe."}, status=400)
            if not Membership.objects.filter(user_id=collaborator.id, organization_id=appointment.organization_id).exists():
                return Response({"detail": "El colaborador no pertenece a esta organización."}, status=400)

        duration_minutes = int(service.service_duration_minutes or 0)
        if duration_minutes <= 0:
            duration_minutes = 30
        ends_at = starts_at + timedelta(minutes=duration_minutes)

        appointment.service = service
        appointment.collaborator = collaborator
        appointment.starts_at = starts_at
        appointment.ends_at = ends_at
        appointment.status = AgendaEvent.STATUS_PENDING
        try:
            appointment.save()
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
            return Response(detail, status=400)

        return Response(
            {
                "detail": "Cita reprogramada correctamente.",
                "appointment": self._serialize_public_appointment(appointment),
            }
        )
