from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0014_update_invoice_payment_method_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="shipment_required",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="invoice",
            name="shipment_details",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
