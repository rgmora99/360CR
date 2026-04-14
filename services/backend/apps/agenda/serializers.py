from rest_framework import serializers

from apps.agenda.models import AgendaEvent, AgendaEventType, CollaboratorAvailability
from apps.finance.models import Product
from apps.tenants.models import Membership


class AgendaEventTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgendaEventType
        fields = ["id", "code", "name", "color"]


class CollaboratorAvailabilitySerializer(serializers.ModelSerializer):
    collaborator_email = serializers.CharField(source="collaborator.email", read_only=True)

    class Meta:
        model = CollaboratorAvailability
        fields = [
            "id",
            "organization",
            "collaborator",
            "collaborator_email",
            "weekday",
            "start_time",
            "end_time",
            "is_active",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        collaborator = attrs.get("collaborator") or getattr(self.instance, "collaborator", None)
        if collaborator and organization:
            if not Membership.objects.filter(user_id=collaborator.id, organization_id=organization.id).exists():
                raise serializers.ValidationError({"collaborator": "El colaborador no pertenece a la organización seleccionada."})
        start_time = attrs.get("start_time") or getattr(self.instance, "start_time", None)
        end_time = attrs.get("end_time") or getattr(self.instance, "end_time", None)
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "La hora final debe ser mayor a la hora inicial."})
        return attrs


class AgendaEventSerializer(serializers.ModelSerializer):
    collaborator_email = serializers.CharField(source="collaborator.email", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = AgendaEvent
        fields = [
            "id",
            "organization",
            "event_type",
            "service",
            "service_name",
            "collaborator",
            "collaborator_email",
            "customer",
            "supplier",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "all_day",
            "status",
            "priority",
            "reminder_minutes",
            "location",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        service = attrs.get("service", getattr(self.instance, "service", None))
        collaborator = attrs.get("collaborator", getattr(self.instance, "collaborator", None))

        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "La fecha de fin debe ser mayor a la fecha de inicio."})

        if service and organization:
            if service.organization_id != organization.id:
                raise serializers.ValidationError({"service": "El servicio debe pertenecer a la misma organización del evento."})
            if service.product_type != Product.TYPE_SERVICE:
                raise serializers.ValidationError({"service": "Solo se pueden asignar servicios en este campo."})

        if collaborator and organization:
            if not Membership.objects.filter(user_id=collaborator.id, organization_id=organization.id).exists():
                raise serializers.ValidationError({"collaborator": "El colaborador no pertenece a la organización seleccionada."})

        return attrs
