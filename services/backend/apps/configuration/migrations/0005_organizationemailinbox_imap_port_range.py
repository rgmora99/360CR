from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


def normalize_invalid_imap_ports(apps, schema_editor):
    OrganizationEmailInbox = apps.get_model("configuration", "OrganizationEmailInbox")
    OrganizationEmailInbox.objects.filter(imap_port__lt=1).update(imap_port=993)
    OrganizationEmailInbox.objects.filter(imap_port__gt=65535).update(imap_port=993)


class Migration(migrations.Migration):

    dependencies = [
        ("configuration", "0004_rolecatalog_is_active"),
    ]

    operations = [
        migrations.RunPython(normalize_invalid_imap_ports, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="organizationemailinbox",
            name="imap_port",
            field=models.PositiveIntegerField(
                default=993,
                validators=[MinValueValidator(1), MaxValueValidator(65535)],
            ),
        ),
        migrations.AddConstraint(
            model_name="organizationemailinbox",
            constraint=models.CheckConstraint(
                condition=models.Q(imap_port__gte=1) & models.Q(imap_port__lte=65535),
                name="ck_org_email_inbox_imap_port_range",
            ),
        ),
    ]
