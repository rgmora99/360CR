from django.db import migrations, models
import django.db.models.deletion

import apps.finance.models


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0015_invoice_shipment_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseInboxAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("attachment_type", models.CharField(choices=[("pdf", "PDF")], default="pdf", max_length=20)),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("file", models.FileField(upload_to=apps.finance.models.purchase_inbox_attachment_upload_to)),
                ("content_type", models.CharField(blank=True, default="application/pdf", max_length=120)),
                ("size_bytes", models.PositiveIntegerField(default=0)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "inbox_invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attachments",
                        to="finance.purchaseinboxinvoice",
                    ),
                ),
            ],
            options={
                "ordering": ["-id"],
            },
        ),
    ]
