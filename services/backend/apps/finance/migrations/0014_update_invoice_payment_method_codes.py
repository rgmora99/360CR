from django.db import migrations


def forwards(apps, schema_editor):
    Invoice = apps.get_model("finance", "Invoice")
    Invoice.objects.filter(payment_method="04").update(payment_method="05")


def backwards(apps, schema_editor):
    Invoice = apps.get_model("finance", "Invoice")
    Invoice.objects.filter(payment_method="05").update(payment_method="04")


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0013_invoicereceivablepayment"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
