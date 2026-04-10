from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PadronRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cedula", models.CharField(db_index=True, max_length=9, unique=True)),
                ("full_name", models.CharField(max_length=180)),
                ("normalized_name", models.CharField(blank=True, default="", max_length=180)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["cedula"],
            },
        ),
        migrations.AddIndex(
            model_name="padronrecord",
            index=models.Index(fields=["cedula"], name="idx_padron_cedula"),
        ),
    ]
