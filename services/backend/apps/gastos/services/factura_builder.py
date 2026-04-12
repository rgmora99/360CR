from django.core.files.base import ContentFile
from apps.gastos.models import FacturaGasto



def crear_factura_desde_correo(*, negocio, usuario, meta, factura_data, xml_bytes, xml_name, pdf_bytes, pdf_name):
    f = FacturaGasto.objects.create(
        negocio=negocio,
        proveedor=factura_data["proveedor"],
        numero_factura=factura_data["numero_factura"],
        fecha_emision=factura_data["fecha_emision"],
        subtotal=factura_data["subtotal"],
        iva=factura_data["iva"],
        total=factura_data["total"],
        estado="pendiente",
        origen="correo",
        email_message_id=meta.get("message_id") or None,
        email_subject=meta.get("subject") or None,
        email_from=meta.get("from") or None,
        usuario_creacion=usuario,
    )

    if xml_bytes and xml_name:
        f.xml_file.save(xml_name, ContentFile(xml_bytes), save=True)

    if pdf_bytes and pdf_name:
        f.pdf_file.save(pdf_name, ContentFile(pdf_bytes), save=True)

    return f