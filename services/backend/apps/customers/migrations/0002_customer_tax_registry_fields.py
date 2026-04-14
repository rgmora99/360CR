from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="tax_activities",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_administration",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_is_delinquent",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_is_omitted",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_last_sync_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_regime_code",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_regime_description",
            field=models.CharField(blank=True, max_length=160),
        ),
        migrations.AddField(
            model_name="customer",
            name="tax_status",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]
