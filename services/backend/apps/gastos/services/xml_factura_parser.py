import xml.etree.ElementTree as ET
from decimal import Decimal
from datetime import datetime, date

def parse_factura_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)

    ns = {"ns": root.tag.split("}")[0].strip("{")}

    def get(path):
        return root.findtext(path, namespaces=ns)

    numero = get(".//ns:NumeroConsecutivo")

    fecha_raw = get(".//ns:FechaEmision")

    # 🛡️ PROTECCIÓN TOTAL
    if fecha_raw:
        try:
            fecha_emision = datetime.fromisoformat(fecha_raw[:19]).date()
        except Exception:
            fecha_emision = date.today()
    else:
        fecha_emision = date.today()  # fallback seguro

    proveedor = get(".//ns:Emisor/ns:Nombre") or "Proveedor desconocido"
    proveedor_cedula = get(".//ns:Emisor/ns:Identificacion/ns:Numero") or ""

    subtotal = get(".//ns:ResumenFactura/ns:TotalVentaNeta")
    iva = get(".//ns:ResumenFactura/ns:TotalImpuesto")
    total = get(".//ns:ResumenFactura/ns:TotalComprobante")

    return {
        "numero_factura": numero or "SIN_NUM",
        "fecha_emision": fecha_emision,  # 👈 JAMÁS NULL
        "subtotal": Decimal(subtotal or "0"),
        "iva": Decimal(iva or "0"),
        "total": Decimal(total or "0"),
        "proveedor": proveedor,
        "proveedor_cedula": proveedor_cedula,
    }