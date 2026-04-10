from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0005_product_inventory_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="service_duration_minutes",
            field=models.PositiveIntegerField(default=30),
        ),
    ]
