from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("finance", "0016_purchaseinboxattachment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="invoice",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Borrador"),
                    ("issued", "Emitida"),
                    ("sent", "Enviada"),
                    ("paid", "Pagada"),
                    ("overdue", "Vencida"),
                    ("void", "Anulada"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="original_invoice",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="credit_notes",
                to="finance.invoice",
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="void_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="voided_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="invoice",
            name="voided_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="voided_invoices",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name="InvoiceAuditLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("void", "Anulacion"),
                            ("credit_note", "Nota de credito"),
                            ("email_sent", "Correo enviado"),
                            ("payment", "Pago registrado"),
                        ],
                        max_length=30,
                    ),
                ),
                ("reason", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL),
                ),
                (
                    "invoice",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="audit_logs", to="finance.invoice"),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
    ]
