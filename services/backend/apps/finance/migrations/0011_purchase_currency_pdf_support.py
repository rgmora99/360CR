from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0010_purchase_tax_inbox_report"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="currency",
            field=models.CharField(default="CRC", max_length=3),
        ),
        migrations.AddField(
            model_name="purchase",
            name="exchange_rate",
            field=models.DecimalField(decimal_places=4, default=Decimal("1.0000"), max_digits=10),
        ),
        migrations.AddField(
            model_name="purchaseinboxinvoice",
            name="currency",
            field=models.CharField(default="CRC", max_length=3),
        ),
        migrations.AddField(
            model_name="purchaseinboxinvoice",
            name="exchange_rate",
            field=models.DecimalField(decimal_places=4, default=Decimal("1.0000"), max_digits=10),
        ),
    ]
