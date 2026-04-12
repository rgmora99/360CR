from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0009_merge_0007_0008"),
        ("tenants", "0003_organization_hacienda_branch_code_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchase",
            name="source",
            field=models.CharField(default="manual", max_length=20),
        ),
        migrations.AddField(
            model_name="purchase",
            name="tax_total",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name="purchase",
            name="total",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.CreateModel(
            name="TaxReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveIntegerField()),
                ("quarter", models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(4)])),
                ("economic_activity", models.CharField(max_length=120)),
                ("rts_factor", models.DecimalField(decimal_places=4, max_digits=8, validators=[django.core.validators.MinValueValidator(Decimal("0.0001"))])),
                ("purchases_subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("purchases_tax", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("purchases_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("estimated_tax", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("due_date", models.DateField()),
                ("declaration_form", models.CharField(default="D-105", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="tenants.organization")),
            ],
            options={"ordering": ["-year", "-quarter", "-id"]},
        ),
        migrations.CreateModel(
            name="PurchaseInboxInvoice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("supplier_name", models.CharField(max_length=200)),
                ("supplier_tax_id", models.CharField(max_length=50)),
                ("buyer_name", models.CharField(blank=True, max_length=200)),
                ("buyer_tax_id", models.CharField(blank=True, max_length=50)),
                ("issue_date", models.DateField()),
                ("invoice_number", models.CharField(max_length=40)),
                ("numeric_key", models.CharField(max_length=50)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("status", models.CharField(choices=[("pending", "Pendiente"), ("in_process", "En registro"), ("registered", "Registrada"), ("rejected", "Rechazada")], default="pending", max_length=20)),
                ("source", models.CharField(default="email", max_length=20)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="purchase_inbox", to="tenants.organization")),
                ("purchase", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="inbox_invoice", to="finance.purchase")),
            ],
            options={"ordering": ["-issue_date", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="purchaseinboxinvoice",
            constraint=models.UniqueConstraint(fields=("organization", "numeric_key"), name="uq_purchase_inbox_org_numeric_key"),
        ),
    ]
