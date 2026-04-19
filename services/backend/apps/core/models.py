from django.conf import settings
from django.db import models


class PadronRecord(models.Model):
    cedula = models.CharField(max_length=9, unique=True, db_index=True)
    full_name = models.CharField(max_length=180)
    normalized_name = models.CharField(max_length=180, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["cedula"]
        indexes = [
            models.Index(fields=["cedula"], name="idx_padron_cedula"),
        ]

    def __str__(self):
        return f"{self.cedula} - {self.full_name}"


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=30, blank=True, default="")
    google_sub = models.CharField(max_length=255, blank=True, null=True, unique=True)
    google_email_verified = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user_id"]

    def __str__(self):
        return f"Perfil {self.user_id}"
