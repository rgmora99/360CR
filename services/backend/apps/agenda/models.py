import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.customers.models import Customer
from apps.finance.models import Product
from apps.suppliers.models import Supplier
from apps.tenants.models import Organization


User = get_user_model()


def generate_public_booking_reference():
    return f"RES-{secrets.token_hex(4).upper()}"


def generate_public_access_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def agenda_weekday_for_date(date_value):
    return (date_value.weekday() + 1) % 7


class AgendaEventType(models.Model):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=80, unique=True)
    color = models.CharField(max_length=7, default="#2563eb")

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CollaboratorAvailability(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="agenda_availability")
    collaborator = models.ForeignKey(User, on_delete=models.CASCADE, related_name="agenda_availability")
    weekday = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["collaborator_id", "weekday"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "collaborator", "weekday"],
                name="uq_agenda_availability_org_collaborator_weekday",
            )
        ]

    def clean(self):
        if self.weekday < 0 or self.weekday > 6:
            raise ValidationError({"weekday": "El día debe estar entre 0 (domingo) y 6 (sábado)."})
        if self.end_time <= self.start_time:
            raise ValidationError({"end_time": "La hora final debe ser mayor a la hora inicial."})

    def __str__(self) -> str:
        return f"{self.organization_id}:{self.collaborator_id}:{self.weekday}"


class AgendaEvent(models.Model):
    STATUS_PENDING = "pending"
    STATUS_DONE = "done"
    STATUS_CANCELLED = "cancelled"

    PRIORITY_LOW = "low"
    PRIORITY_MEDIUM = "medium"
    PRIORITY_HIGH = "high"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendiente"),
        (STATUS_DONE, "Completado"),
        (STATUS_CANCELLED, "Cancelado"),
    ]

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Baja"),
        (PRIORITY_MEDIUM, "Media"),
        (PRIORITY_HIGH, "Alta"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    event_type = models.ForeignKey(AgendaEventType, on_delete=models.PROTECT)
    service = models.ForeignKey(Product, on_delete=models.PROTECT, null=True, blank=True)
    collaborator = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    invoice = models.OneToOneField("finance.Invoice", on_delete=models.SET_NULL, null=True, blank=True, related_name="agenda_event")
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    reminder_minutes = models.PositiveIntegerField(default=30)
    location = models.CharField(max_length=150, blank=True)
    public_reference = models.CharField(max_length=20, unique=True, blank=True, null=True)
    public_access_code_hash = models.CharField(max_length=128, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at", "id"]

    def clean(self):
        if self.ends_at <= self.starts_at:
            raise ValidationError({"ends_at": "La fecha de fin debe ser mayor a la fecha de inicio."})

        if self.customer_id and self.customer.organization_id != self.organization_id:
            raise ValidationError({"customer": "El cliente no pertenece a la organización seleccionada."})

        if self.supplier_id and self.supplier.organization_id != self.organization_id:
            raise ValidationError({"supplier": "El proveedor no pertenece a la organización seleccionada."})

        if self.service_id:
            if self.service.organization_id != self.organization_id:
                raise ValidationError({"service": "El servicio no pertenece a la organización seleccionada."})
            if self.service.product_type != Product.TYPE_SERVICE:
                raise ValidationError({"service": "Solo se pueden agendar productos de tipo servicio."})

        if self.collaborator_id and not self.collaborator.membership_set.filter(organization_id=self.organization_id).exists():
            raise ValidationError({"collaborator": "El colaborador no pertenece a la organización seleccionada."})

        if self.collaborator_id:
            local_start = timezone.localtime(self.starts_at)
            local_end = timezone.localtime(self.ends_at)
            if local_start.date() != local_end.date():
                raise ValidationError({"starts_at": "La cita debe iniciar y terminar el mismo día para validar disponibilidad."})

            weekday = agenda_weekday_for_date(local_start.date())
            availability = CollaboratorAvailability.objects.filter(
                organization_id=self.organization_id,
                collaborator_id=self.collaborator_id,
                weekday=weekday,
            ).first()
            if not availability:
                raise ValidationError({"starts_at": "Este colaborador no tiene horario configurado para el día seleccionado."})
            if not availability.is_active:
                raise ValidationError({"starts_at": "El colaborador no está disponible ese día."})

            starts_at_time = local_start.time().replace(tzinfo=None)
            ends_at_time = local_end.time().replace(tzinfo=None)
            if starts_at_time < availability.start_time or ends_at_time > availability.end_time:
                raise ValidationError(
                    {
                        "starts_at": (
                            "La cita está fuera del horario del colaborador. "
                            f"Horario disponible: {availability.start_time.strftime('%H:%M')} - {availability.end_time.strftime('%H:%M')}."
                        )
                    }
                )

        overlap_filter = Q(collaborator_id=self.collaborator_id) if self.collaborator_id else Q(collaborator__isnull=True)
        conflicts = (
            AgendaEvent.objects.filter(organization_id=self.organization_id)
            .exclude(id=self.id)
            .exclude(status=self.STATUS_CANCELLED)
            .filter(overlap_filter)
            .filter(starts_at__lt=self.ends_at, ends_at__gt=self.starts_at)
        )
        if conflicts.exists():
            owner = "sin colaborador" if not self.collaborator_id else f"del colaborador {self.collaborator.email}"
            raise ValidationError({"starts_at": f"Ya existe una cita en ese horario {owner}."})

    def save(self, *args, **kwargs):
        if not self.public_reference:
            while True:
                candidate = generate_public_booking_reference()
                if not AgendaEvent.objects.filter(public_reference=candidate).exclude(pk=self.pk).exists():
                    self.public_reference = candidate
                    break
        self.full_clean()
        super().save(*args, **kwargs)

    def issue_public_access_code(self):
        access_code = generate_public_access_code()
        self.public_access_code_hash = make_password(access_code)
        return access_code

    def has_public_access_code(self):
        return bool(self.public_access_code_hash)

    def verify_public_access_code(self, raw_code):
        if not self.public_access_code_hash or not raw_code:
            return False
        return check_password(str(raw_code).strip(), self.public_access_code_hash)

    def __str__(self) -> str:
        return f"{self.title} ({self.starts_at:%Y-%m-%d %H:%M})"
