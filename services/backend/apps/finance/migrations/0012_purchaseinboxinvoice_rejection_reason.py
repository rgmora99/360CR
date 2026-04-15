from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0011_purchase_currency_pdf_support"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseinboxinvoice",
            name="rejection_reason",
            field=models.TextField(blank=True),
        ),
    ]
