from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agenda", "0005_agendaevent_invoice"),
    ]

    operations = [
        migrations.AddField(
            model_name="agendaevent",
            name="public_access_code_hash",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="agendaevent",
            name="public_reference",
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
    ]
