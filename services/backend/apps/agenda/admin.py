from django.contrib import admin

from apps.agenda.models import AgendaEvent, AgendaEventType


@admin.register(AgendaEventType)
class AgendaEventTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name", "color")
    search_fields = ("code", "name")


@admin.register(AgendaEvent)
class AgendaEventAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "title", "starts_at", "ends_at", "status", "priority")
    list_filter = ("status", "priority", "event_type", "organization")
    search_fields = ("title", "location", "description")
