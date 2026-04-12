from email import message_from_bytes
from email.header import decode_header

def _decode_header(value):
    if not value:
        return ""
    parts = decode_header(value)
    decoded = ""
    for text, enc in parts:
        if isinstance(text, bytes):
            decoded += text.decode(enc or "utf-8", errors="ignore")
        else:
            decoded += text
    return decoded

def parse_email(raw_bytes: bytes):
    msg = message_from_bytes(raw_bytes)
    subject = _decode_header(msg.get("Subject"))
    from_ = _decode_header(msg.get("From"))
    message_id = (msg.get("Message-ID") or "").strip()

    return msg, {
        "subject": subject,
        "from": from_,
        "message_id": message_id,
    }