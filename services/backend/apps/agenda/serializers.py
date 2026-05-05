from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
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
                raise serializers.ValidationError({"collaborator": "El colaborador no pertenece a la organizacion seleccionada."})
        start_time = attrs.get("start_time") or getattr(self.instance, "start_time", None)
        end_time = attrs.get("end_time") or getattr(self.instance, "end_time", None)
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "La hora final debe ser mayor a la hora inicial."})
        if attrs.get("weekday", getattr(self.instance, "weekday", 0)) not in range(0, 7):
            raise serializers.ValidationError({"weekday": "El dia debe estar entre 0 (domingo) y 6 (sabado)."})
        return attrs

    def _save_with_model_validation(self, save_callable):
        try:
            with transaction.atomic():
                return save_callable()
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
            raise serializers.ValidationError(detail)

    def create(self, validated_data):
        return self._save_with_model_validation(lambda: super(CollaboratorAvailabilitySerializer, self).create(validated_data))

    def update(self, instance, validated_data):
        return self._save_with_model_validation(lambda: super(CollaboratorAvailabilitySerializer, self).update(instance, validated_data))


class AgendaEventSerializer(serializers.ModelSerializer):
    collaborator_email = serializers.CharField(source="collaborator.email", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    customer_name = serializers.CharField(source="customer.legal_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

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
            "customer_name",
            "supplier",
            "invoice",
            "invoice_number",
            "title",
            "description",
            "starts_at",
            "ends_at",
            "all_day",
            "status",
            "status_display",
            "priority",
            "reminder_minutes",
            "location",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and self.instance.status in {AgendaEvent.STATUS_DONE, AgendaEvent.STATUS_CANCELLED}:
            raise serializers.ValidationError(
                {"status": "No se puede editar una cita con estado final."}
            )
        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        event_type = attrs.get("event_type", getattr(self.instance, "event_type", None))
        service = attrs.get("service", getattr(self.instance, "service", None))
        collaborator = attrs.get("collaborator", getattr(self.instance, "collaborator", None))
        customer = attrs.get("customer", getattr(self.instance, "customer", None))
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        invoice = attrs.get("invoice", getattr(self.instance, "invoice", None))
        status = attrs.get("status", getattr(self.instance, "status", AgendaEvent.STATUS_PENDING))
        title = (attrs.get("title", getattr(self.instance, "title", "")) or "").strip()
        reminder_minutes = attrs.get("reminder_minutes", getattr(self.instance, "reminder_minutes", 30))

        if "title" in attrs:
            attrs["title"] = title
        if invoice and status != AgendaEvent.STATUS_DONE:
            attrs["status"] = AgendaEvent.STATUS_DONE
            status = AgendaEvent.STATUS_DONE
        if len(title) < 3:
            raise serializers.ValidationError({"title": "El titulo debe tener al menos 3 caracteres."})

        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "La fecha de fin debe ser mayor a la fecha de inicio."})
        if starts_at and status == AgendaEvent.STATUS_PENDING and starts_at < timezone.now():
            raise serializers.ValidationError({"starts_at": "No se pueden crear o reactivar citas pendientes en el pasado."})
        if starts_at and ends_at and (ends_at - starts_at) > timedelta(hours=12):
            raise serializers.ValidationError({"ends_at": "La duracion maxima permitida para una cita es de 12 horas."})

        if reminder_minutes is not None and int(reminder_minutes) > 1440:
            raise serializers.ValidationError({"reminder_minutes": "El recordatorio no puede superar 1440 minutos."})

        if customer and supplier:
            raise serializers.ValidationError({"supplier": "Una cita no debe relacionarse con cliente y proveedor al mismo tiempo."})

        if service and organization:
            if service.organization_id != organization.id:
                raise serializers.ValidationError({"service": "El servicio debe pertenecer a la misma organizacion del evento."})
            if service.product_type != Product.TYPE_SERVICE:
                raise serializers.ValidationError({"service": "Solo se pueden asignar servicios en este campo."})
            duration_minutes = int(service.service_duration_minutes or 0) or 30
            if starts_at and ends_at:
                expected_end = starts_at + timedelta(minutes=duration_minutes)
                if abs((ends_at - expected_end).total_seconds()) > 60:
                    raise serializers.ValidationError(
                        {
                            "ends_at": (
                                "La hora de fin debe coincidir con la duracion configurada del servicio "
                                f"({duration_minutes} min) para mantener consistencia con el portal de autogestion."
                            )
                        }
                    )

        if collaborator and organization:
            if not Membership.objects.filter(user_id=collaborator.id, organization_id=organization.id).exists():
                raise serializers.ValidationError({"collaborator": "El colaborador no pertenece a la organizacion seleccionada."})

        if event_type and getattr(event_type, "code", "") == "cita":
            if not service:
                raise serializers.ValidationError({"service": "Las citas deben tener un servicio asociado."})
            if not collaborator:
                raise serializers.ValidationError({"collaborator": "Las citas deben tener un colaborador asignado."})

        return attrs

    def _save_with_model_validation(self, save_callable):
        try:
            with transaction.atomic():
                return save_callable()
        except DjangoValidationError as exc:
            detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
            raise serializers.ValidationError(detail)

    def create(self, validated_data):
        return self._save_with_model_validation(lambda: super(AgendaEventSerializer, self).create(validated_data))

    def update(self, instance, validated_data):
        return self._save_with_model_validation(lambda: super(AgendaEventSerializer, self).update(instance, validated_data))
