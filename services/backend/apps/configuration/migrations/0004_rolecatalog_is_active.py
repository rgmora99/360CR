from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("configuration", "0003_small_business_roles"),
    ]

    operations = [
        migrations.AddField(
            model_name="rolecatalog",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
