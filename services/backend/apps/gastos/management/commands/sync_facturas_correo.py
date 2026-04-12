from django.core.management.base import BaseCommand
from apps.gastos.services.sync_facturas import sync_facturas

class Command(BaseCommand):
    help = "Sincroniza facturas desde correo"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int)

    def handle(self, *args, **options):
        year = options.get("year")

        resultados = sync_facturas(
            year=year,
            solo_unread=False
        )

        for r in resultados:
            self.stdout.write(
                f"✔ Negocio {r['negocio']} | Nuevas: {r['creadas']} | Omitidas: {r['omitidas']}"
            )