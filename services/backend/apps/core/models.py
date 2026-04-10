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
