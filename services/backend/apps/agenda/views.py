from django.utils.dateparse import parse_datetime
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.agenda.models import AgendaEvent, AgendaEventType
from apps.agenda.serializers import AgendaEventSerializer, AgendaEventTypeSerializer
from apps.tenants.access import OrganizationScopedViewMixin


class AgendaEventTypeViewSet(viewsets.ModelViewSet):
    queryset = AgendaEventType.objects.all()
    serializer_class = AgendaEventTypeSerializer
    permission_classes = [IsAuthenticated]


class AgendaEventViewSet(OrganizationScopedViewMixin, viewsets.ModelViewSet):
    serializer_class = AgendaEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = AgendaEvent.objects.select_related(
            "organization",
            "event_type",
            "customer",
            "supplier",
        ).all()

        status = self.request.query_params.get("status")
        if status:
            queryset = queryset.filter(status=status)

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
            queryset = queryset.filter(title__icontains=search)

        return self.scope_queryset(queryset)

    def perform_create(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_organization_payload(serializer.validated_data["organization"].id)
        serializer.save()
