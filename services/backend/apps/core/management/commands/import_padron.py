import csv
import re
import unicodedata
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.core.models import PadronRecord


def normalize_cedula(value):
    return re.sub(r"\D", "", str(value or ""))


def normalize_name(value):
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(char for char in text if unicodedata.category(char) != "Mn")


def parse_delimited_line(line):
    delimiter = "\t"
    if "|" in line:
        delimiter = "|"
    elif ";" in line:
        delimiter = ";"
    elif "," in line:
        delimiter = ","
    row = next(csv.reader([line], delimiter=delimiter))
    if not row:
        return None

    cedula = normalize_cedula(row[0])
    if len(cedula) != 9:
        return None
    full_name = " ".join(part.strip() for part in row[1:] if part.strip())
    if not full_name:
        return None
    return cedula, full_name


def parse_fixed_width_line(line):
    if len(line) < 111:
        return None
    cedula = normalize_cedula(line[0:9])
    if len(cedula) != 9:
        return None

    nombre = line[29:59].strip()
    apellido1 = line[59:85].strip()
    apellido2 = line[85:111].strip()
    full_name = " ".join(part for part in [nombre, apellido1, apellido2] if part)
    if not full_name:
        return None
    return cedula, full_name


class Command(BaseCommand):
    help = "Importa el padrón electoral en BD para consulta indexada por cédula."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Ruta al PADRON_COMPLETO.txt o archivo delimitado.")
        parser.add_argument("--truncate", action="store_true", help="Borra el padrón existente antes de importar.")
        parser.add_argument("--batch-size", type=int, default=5000, help="Tamaño de lote para inserción masiva.")

    def handle(self, *args, **options):
        file_path = Path(options["file"]).expanduser()
        if not file_path.exists():
            raise CommandError(f"No existe el archivo: {file_path}")

        if options["truncate"]:
            deleted = PadronRecord.objects.all().delete()[0]
            self.stdout.write(self.style.WARNING(f"Registros eliminados: {deleted}"))

        batch_size = max(500, options["batch_size"])
        to_create = []
        processed = 0
        inserted = 0

        with file_path.open("r", encoding="utf-8", errors="ignore") as handler:
            for raw_line in handler:
                line = raw_line.rstrip("\r\n")
                if not line.strip():
                    continue

                parsed = parse_delimited_line(line) if any(sep in line for sep in [",", ";", "|", "\t"]) else parse_fixed_width_line(line)
                if not parsed:
                    continue

                cedula, full_name = parsed
                to_create.append(
                    PadronRecord(
                        cedula=cedula,
                        full_name=full_name,
                        normalized_name=normalize_name(full_name),
                    )
                )
                processed += 1

                if len(to_create) >= batch_size:
                    PadronRecord.objects.bulk_create(to_create, batch_size=batch_size, ignore_conflicts=True)
                    inserted += len(to_create)
                    to_create.clear()

        if to_create:
            PadronRecord.objects.bulk_create(to_create, batch_size=batch_size, ignore_conflicts=True)
            inserted += len(to_create)

        total = PadronRecord.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Importación finalizada. Leídos: {processed}, cargados lote: {inserted}, total en BD: {total}."))
