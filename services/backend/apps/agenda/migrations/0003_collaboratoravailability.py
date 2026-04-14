from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0001_initial"),
        ("agenda", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CollaboratorAvailability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("weekday", models.PositiveSmallIntegerField()),
                ("start_time", models.TimeField()),
                ("end_time", models.TimeField()),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "collaborator",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="agenda_availability",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="agenda_availability",
                        to="tenants.organization",
                    ),
                ),
            ],
            options={"ordering": ["collaborator_id", "weekday"]},
        ),
        migrations.AddConstraint(
            model_name="collaboratoravailability",
            constraint=models.UniqueConstraint(
                fields=("organization", "collaborator", "weekday"),
                name="uq_agenda_availability_org_collaborator_weekday",
            ),
        ),
    ]
