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
        if self.action in {"availability", "self_book"}:
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

    def perform_create(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()
