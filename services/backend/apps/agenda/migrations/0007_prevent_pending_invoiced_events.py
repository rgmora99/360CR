from django.db import migrations, models
from django.db.models import Q


def mark_invoiced_events_done(apps, _schema_editor):
    AgendaEvent = apps.get_model("agenda", "AgendaEvent")
    AgendaEvent.objects.filter(invoice__isnull=False, status="pending").update(status="done")


class Migration(migrations.Migration):

    dependencies = [
        ("agenda", "0006_agendaevent_public_access_fields"),
    ]

    operations = [
        migrations.RunPython(mark_invoiced_events_done, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="agendaevent",
            constraint=models.CheckConstraint(
                condition=Q(invoice__isnull=True) | ~Q(status="pending"),
                name="ck_agenda_event_invoice_not_pending",
            ),
        ),
    ]
