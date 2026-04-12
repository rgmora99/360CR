from django.conf import settings
from django.db import models
from decimal import Decimal
from apps.accounts.models import TB_NEGOCIOS # ajusta el import según tu proyecto

class ConfigCorreoFactura(models.Model):
    negocio = models.OneToOneField(
        TB_NEGOCIOS, on_delete=models.CASCADE, related_name="correo_facturas"
    )

    # IMAP
    imap_host = models.CharField(max_length=120, default="imap.gmail.com")
    imap_port = models.PositiveIntegerField(default=993)
    imap_ssl = models.BooleanField(default=True)

    email = models.EmailField()
    username = models.CharField(max_length=120)
    password = models.CharField(max_length=200)  # luego ciframos
    carpeta = models.CharField(max_length=80, default="INBOX")

    activo = models.BooleanField(default=True)
    ultima_sync = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Correo facturas ({self.negocio_id}) - {self.email}"
    
class CategoriaGasto(models.Model):
    negocio = models.ForeignKey(
        TB_NEGOCIOS,
        on_delete=models.CASCADE,
        related_name="categorias_gasto"
    )
    nombre = models.CharField(max_length=100)
    activo = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

class FacturaGasto(models.Model):

    ESTADOS = (
        ("pendiente", "Pendiente"),
        ("en_registro", "En registro"),
        ("registrada", "Registrada"),
        ("rechazada", "Rechazada"),
    )

    negocio = models.ForeignKey(
        TB_NEGOCIOS, on_delete=models.CASCADE, related_name="facturas"
    )

    proveedor = models.CharField(max_length=150)
    numero_factura = models.CharField(max_length=50)
    fecha_emision = models.DateField()
    fecha_registro = models.DateTimeField(auto_now_add=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    iva = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    categoria = models.ForeignKey(
        "CategoriaGasto", on_delete=models.SET_NULL, null=True, blank=True
    )

    estado = models.CharField(max_length=20, choices=ESTADOS, default="pendiente")

    # adjuntos
    xml_file = models.FileField(upload_to="facturas_gastos/xml/", null=True, blank=True)
    pdf_file = models.FileField(upload_to="facturas_gastos/pdf/", null=True, blank=True)

    # trazabilidad correo
    origen = models.CharField(max_length=20, default="correo")  # correo | manual
    email_message_id = models.CharField(max_length=255, null=True, blank=True)
    email_subject = models.CharField(max_length=255, null=True, blank=True)
    email_from = models.CharField(max_length=255, null=True, blank=True)

    usuario_creacion = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        ordering = ["-fecha_emision"]
        indexes = [
            models.Index(fields=["negocio", "estado"]),
            models.Index(fields=["negocio", "numero_factura"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["negocio", "email_message_id"],
                name="uniq_factura_por_mensaje",
                condition=models.Q(email_message_id__isnull=False),
            )
        ]

    def __str__(self):
        return f"{self.proveedor} - {self.numero_factura}"
    
    
class Gasto(models.Model):
    negocio = models.ForeignKey(
        TB_NEGOCIOS, on_delete=models.CASCADE, related_name="gastos"
    )

    ESTADOS = (
        ("registrado", "Registrado"),
        ("anulado", "Anulado"),
    )

    estado = models.CharField(
        max_length=20,
        choices=ESTADOS,
        default="registrado"
    )

    factura = models.OneToOneField(
        FacturaGasto,
        on_delete=models.PROTECT,
        related_name="gasto"
    )

    categoria = models.ForeignKey(
        CategoriaGasto, on_delete=models.PROTECT
    )

    fecha_gasto = models.DateField()
    metodo_pago = models.CharField(max_length=30, blank=True, null=True)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    iva = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    notas = models.TextField(blank=True, null=True)

    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["negocio", "fecha_gasto"]),
            models.Index(fields=["negocio", "estado"]),
        ]

    def __str__(self):
        return f"Gasto #{self.id} - {self.total}"