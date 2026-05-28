from django.core.validators import MinValueValidator
from django.db import migrations, models


def clamp_negative_available_points(apps, schema_editor):
    LoyaltyMember = apps.get_model("loyalty", "LoyaltyMember")
    LoyaltyMember.objects.filter(available_points__lt=0).update(available_points=0)


class Migration(migrations.Migration):
    dependencies = [
        ("loyalty", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(clamp_negative_available_points, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="loyaltymember",
            name="available_points",
            field=models.IntegerField(default=0, validators=[MinValueValidator(0)]),
        ),
        migrations.AddConstraint(
            model_name="loyaltymember",
            constraint=models.CheckConstraint(
                condition=models.Q(available_points__gte=0),
                name="ck_loyalty_member_available_non_negative",
            ),
        ),
    ]
