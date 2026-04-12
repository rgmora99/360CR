from apps.gastos.models import FacturaGasto

def existe_por_message_id(negocio_id, message_id: str) -> bool:
    if not message_id:
        return False
    return FacturaGasto.objects.filter(
        negocio_id=negocio_id,
        email_message_id=message_id
    ).exists()