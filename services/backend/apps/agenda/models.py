from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from apps.customers.models import Customer
from apps.finance.models import Product
from apps.suppliers.models import Supplier
from apps.tenants.models import Organization


User = get_user_model()


class AgendaEventType(models.Model):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=80, unique=True)
    color = models.CharField(max_length=7, default="#2563eb")

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


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
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    reminder_minutes = models.PositiveIntegerField(default=30)
    location = models.CharField(max_length=150, blank=True)
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
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} ({self.starts_at:%Y-%m-%d %H:%M})"
