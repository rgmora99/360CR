import os

def extract_xml_pdf(msg):
    xml_bytes = None
    pdf_bytes = None
    xml_name = None
    pdf_name = None

    if not msg.is_multipart():
        return None, None, None, None

    for part in msg.walk():
        content_disposition = str(part.get("Content-Disposition", ""))
        filename = part.get_filename()
        if not filename or "attachment" not in content_disposition.lower():
            continue

        name = filename
        lower = name.lower()

        payload = part.get_payload(decode=True)
        if not payload:
            continue

        if lower.endswith(".xml") and xml_bytes is None:
            xml_bytes = payload
            xml_name = os.path.basename(name)

        if lower.endswith(".pdf") and pdf_bytes is None:
            pdf_bytes = payload
            pdf_name = os.path.basename(name)

    return xml_bytes, pdf_bytes, xml_name, pdf_name