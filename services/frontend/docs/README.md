# Padrón electoral para autocompletado de cédula

Coloca aquí el archivo del padrón electoral que usarán los formularios del front-end.

## Rutas soportadas
El sistema intentará cargar, en este orden:

1. `/docs/PADRON_COMPLETO.txt`
2. `/docs/padron_completo.txt`
3. `/docs/padron-electoral.txt`
4. `/docs/padron-electoral.csv`
5. `/docs/padron-electoral.tsv`
6. `/PADRON_COMPLETO.txt`
7. `/padron_completo.txt`

## Formatos soportados
El parser soporta:

1. **Formato oficial PADRON_COMPLETO.TXT del TSE** (ancho fijo), usando:
   - cédula: posiciones 1-9
   - nombre: posiciones 30-59
   - primer apellido: 60-85
   - segundo apellido: 86-111
2. Formato delimitado por **tab**, `|`, `;` o `,`.

### Con encabezado (recomendado)
Debe incluir una columna de cédula (`cedula`, `cédula`, `identificacion`) y una de nombre (`nombre`, `nombre completo`, `full_name`).

### Sin encabezado
Se toma la primera columna como cédula y el resto como nombre completo.

## Ejemplo

```txt
cedula,nombre_completo
1-1111-1111,María Pérez Quesada
2-2222-2222,Carlos Rojas Solano
```

## Importante para despliegue

`PADRON_COMPLETO.txt` está en `.gitignore`, así que **no se versiona**. Debes copiarlo manualmente en `services/frontend/docs/` en cada entorno antes de reconstruir el contenedor de frontend.

## Modo recomendado (rápido): padrón indexado en BD

Ahora el frontend consulta primero `GET /api/padron/lookup/?cedula=...`, que usa un índice por cédula en base de datos.  
Para cargar datos en BD:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py import_padron --file /ruta/PADRON_COMPLETO.txt --truncate
```

Si el API no tiene datos cargados, el frontend usa el fallback local por archivo en `/docs/*`.
