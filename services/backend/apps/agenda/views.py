from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.agenda.models import AgendaEvent, AgendaEventType
from apps.agenda.serializers import AgendaEventSerializer, AgendaEventTypeSerializer
from apps.customers.models import Customer, CustomerType
from apps.customers.serializers import CustomerSerializer
from apps.finance.models import Product
from apps.tenants.access import OrganizationScopedViewMixin
from apps.tenants.models import Membership, Organization


User = get_user_model()


class AgendaEventTypeViewSet(viewsets.ModelViewSet):
    queryset = AgendaEventType.objects.all()
    serializer_class = AgendaEventTypeSerializer
    permission_classes = [IsAuthenticated]


class AgendaEventViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = AgendaEventSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {"availability", "self_book", "self_book_context", "self_book_customer"}:
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

        tz = timezone.get_current_timezone()
        start_of_day = timezone.make_aware(datetime.combine(day, datetime.min.time()), tz)
        end_of_day = start_of_day + timedelta(days=1)

        events = (
            AgendaEvent.objects.filter(
                organization=organization,
                collaborator=collaborator,
                starts_at__lt=end_of_day,
                ends_at__gt=start_of_day,
            )
            .exclude(status=AgendaEvent.STATUS_CANCELLED)
            .order_by("starts_at")
            .values("starts_at", "ends_at", "title", "service_id")
        )

        occupied = [
            {
                "starts_at": item["starts_at"].isoformat(),
                "ends_at": item["ends_at"].isoformat(),
                "title": item["title"],
                "service_id": item["service_id"],
            }
            for item in events
        ]
        return Response({"organization": organization.id, "collaborator": collaborator.id, "date": day.isoformat(), "occupied": occupied})

    @action(detail=False, methods=["post"], url_path="self-book")
    def self_book(self, request):
        required_fields = ["organization", "event_type", "service", "collaborator", "title", "starts_at", "ends_at"]
        missing = [field for field in required_fields if not request.data.get(field)]
        if missing:
            return Response({"detail": f"Campos requeridos faltantes: {', '.join(missing)}"}, status=400)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(status=AgendaEvent.STATUS_PENDING)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

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
            .values("id", "name")
            .order_by("name")
        )

        collaborators = [
            {"id": membership.user_id, "email": membership.user.email}
            for membership in Membership.objects.select_related("user").filter(organization=organization).order_by("user__email")
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

    @action(detail=False, methods=["get", "post"], url_path="self-book-customer")
    def self_book_customer(self, request):
        if request.method.lower() == "get":
            organization_id = request.query_params.get("organization_id")
            tax_id = (request.query_params.get("tax_id") or "").strip()
        else:
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
        if request.method.lower() == "get":
            if not existing_customer:
                return Response({"exists": False, "detail": "Cliente no encontrado."}, status=404)
            return Response(
                {
                    "exists": True,
                    "customer": {
                        "id": existing_customer.id,
                        "legal_name": existing_customer.legal_name,
                        "tax_id": existing_customer.tax_id,
                        "email": existing_customer.email,
                        "phone": existing_customer.phone,
                    },
                }
            )

        if existing_customer:
            return Response(
                {
                    "created": False,
                    "customer": {
                        "id": existing_customer.id,
                        "legal_name": existing_customer.legal_name,
                        "tax_id": existing_customer.tax_id,
                        "email": existing_customer.email,
                        "phone": existing_customer.phone,
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
                    "email": customer.email,
                    "phone": customer.phone,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    def perform_create(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()
