from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0012_purchaseinboxinvoice_rejection_reason"),
        ("agenda", "0004_merge_0002_agendaevent_collaborator_agendaevent_service_0003_collaboratoravailability"),
    ]

    operations = [
        migrations.AddField(
            model_name="agendaevent",
            name="invoice",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="agenda_event",
                to="finance.invoice",
            ),
        ),
    ]
