from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.agenda.views import AgendaEventTypeViewSet, AgendaEventViewSet, CollaboratorAvailabilityViewSet

router = DefaultRouter()
router.register(r"agenda-event-types", AgendaEventTypeViewSet, basename="agenda-event-type")
router.register(r"agenda-availability", CollaboratorAvailabilityViewSet, basename="agenda-availability")
router.register(r"agenda-events", AgendaEventViewSet, basename="agenda-event")

urlpatterns = [
    path("", include(router.urls)),
]
