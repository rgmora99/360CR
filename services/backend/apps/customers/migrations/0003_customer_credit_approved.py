from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0002_customer_tax_registry_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="credit_approved",
            field=models.BooleanField(default=False),
        ),
    ]
