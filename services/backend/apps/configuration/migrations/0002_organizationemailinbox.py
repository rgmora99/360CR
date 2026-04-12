from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("configuration", "0001_initial"),
        ("tenants", "0002_organization_parent_organization"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrganizationEmailInbox",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("label", models.CharField(default="Principal", max_length=80)),
                ("email", models.EmailField(max_length=254)),
                ("username", models.CharField(max_length=120)),
                ("password", models.CharField(max_length=200)),
                ("imap_host", models.CharField(default="imap.gmail.com", max_length=120)),
                ("imap_port", models.PositiveIntegerField(default=993)),
                ("imap_ssl", models.BooleanField(default=True)),
                ("folder", models.CharField(default="INBOX", max_length=80)),
                ("is_primary", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="email_inboxes", to="tenants.organization")),
            ],
            options={"ordering": ["organization_id", "-is_primary", "label", "email"]},
        ),
        migrations.AddConstraint(
            model_name="organizationemailinbox",
            constraint=models.UniqueConstraint(fields=("organization", "email"), name="uq_org_email_inbox"),
        ),
        migrations.AddConstraint(
            model_name="organizationemailinbox",
            constraint=models.UniqueConstraint(condition=models.Q(("is_primary", True)), fields=("organization",), name="uq_org_primary_email_inbox"),
        ),
    ]
