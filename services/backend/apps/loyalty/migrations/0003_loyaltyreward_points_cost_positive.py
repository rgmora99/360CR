from django.core.validators import MinValueValidator
from django.db import migrations, models


def clamp_non_positive_points_cost(apps, schema_editor):
    LoyaltyReward = apps.get_model("loyalty", "LoyaltyReward")
    LoyaltyReward.objects.filter(points_cost__lt=1).update(points_cost=1)


class Migration(migrations.Migration):

    dependencies = [
        ("loyalty", "0002_loyaltymember_available_points_non_negative"),
    ]

    operations = [
        migrations.RunPython(clamp_non_positive_points_cost, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="loyaltyreward",
            name="points_cost",
            field=models.PositiveIntegerField(validators=[MinValueValidator(1)]),
        ),
        migrations.AddConstraint(
            model_name="loyaltyreward",
            constraint=models.CheckConstraint(
                condition=models.Q(points_cost__gte=1),
                name="ck_loyalty_reward_points_cost_positive",
            ),
        ),
    ]
