from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0002_invoice_product_invoiceitem_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="installment_count",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="invoice",
            name="installment_interval_days",
            field=models.PositiveSmallIntegerField(default=30),
        ),
        migrations.AddField(
            model_name="invoice",
            name="tax_regime",
            field=models.CharField(
                choices=[("simplified", "Régimen simplificado"), ("general", "Régimen general")],
                default="simplified",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="invoice",
            name="payment_method",
            field=models.CharField(
                choices=[
                    ("01", "Efectivo"),
                    ("02", "Tarjeta"),
                    ("03", "Transferencia"),
                    ("04", "A plazos"),
                ],
                default="01",
                max_length=2,
            ),
        ),
    ]
