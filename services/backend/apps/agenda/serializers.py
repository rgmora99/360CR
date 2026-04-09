from rest_framework import serializers

from apps.agenda.models import AgendaEvent, AgendaEventType


class AgendaEventTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgendaEventType
        fields = ["id", "code", "name", "color"]


class AgendaEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgendaEvent
        fields = [
            "id",
            "organization",
            "event_type",
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

        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "La fecha de fin debe ser mayor a la fecha de inicio."})

        return attrs
