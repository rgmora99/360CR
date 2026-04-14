import json
import urllib.error
import urllib.parse
import urllib.request


HACIENDA_TAXPAYER_API = "https://api.hacienda.go.cr/fe/ae?identificacion="


def normalize_tax_id(value):
    return "".join(character for character in str(value or "") if character.isdigit())


def lookup_hacienda_taxpayer(tax_id, timeout=5):
    normalized_tax_id = normalize_tax_id(tax_id)
    if not normalized_tax_id:
        return None

    request_url = f"{HACIENDA_TAXPAYER_API}{urllib.parse.quote(normalized_tax_id)}"
    request = urllib.request.Request(
        request_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "360CR/1.0",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
