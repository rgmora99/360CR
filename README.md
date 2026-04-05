# 360CR - Base fullstack (Django + PostgreSQL + Frontend)

Estructura base para iniciar **360CR** como plataforma SaaS enfocada en emprendedores y pymes para controlar ingresos y gastos.

## Stack inicial
- **Backend:** Django 5 + DRF
- **Base de datos:** PostgreSQL 16
- **Frontend:** landing/dashboard inicial en HTML/CSS moderno
- **Contenedores:** Docker Compose

## Estructura del proyecto

```text
.
├── docker-compose.yml
├── .env.example
└── services
    ├── backend
    │   ├── config/
    │   ├── apps/
    │   │   ├── core/
    │   │   ├── tenants/
    │   │   └── finance/
    │   ├── manage.py
    │   ├── requirements.txt
    │   └── Dockerfile
    └── frontend
        ├── index.html
        ├── styles.css
        ├── nginx.conf
        └── Dockerfile
```

## Docker: pasos para que funcione correctamente

### 1) Instalar Docker y Docker Compose
- Docker Desktop (Windows/Mac) o Docker Engine + Compose Plugin (Linux).
- Verifica instalación:

```bash
docker --version
docker compose version
```

### 2) Configurar variables de entorno
Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Si necesitas cambiar credenciales de BD, edita `.env`.


### Solución rápida para error `502 Bad Gateway` en `/api/*`
Si en el frontend (http://localhost:3000) ves `502 Bad Gateway` al llamar `/api/...`, normalmente el backend no pudo iniciar por conexión a PostgreSQL.

Verifica que en tu `.env` tengas:

```bash
DB_HOST=db
DB_PORT=5432
DB_NAME=cr360
DB_USER=cr360
DB_PASSWORD=cr360pass
```

> En Docker Compose, el host de PostgreSQL es `db` (nombre del servicio), **no** `localhost`.

### 3) Levantar todo el stack

```bash
docker compose up --build
```

Servicios disponibles:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000/health/
- PostgreSQL: localhost:5432

### ¿Dónde ver las tablas en PostgreSQL?
Si ya levantaste el stack con Docker Compose, puedes validar las tablas así:

1. Verifica que backend y db estén arriba:

```bash
docker compose ps
```


> El warning `the attribute version is obsolete` en `docker-compose.yml` no bloquea el arranque; es informativo.

2. Ejecuta migraciones (crea tablas):

```bash
docker compose exec backend python manage.py migrate
```

3. Entra a PostgreSQL y lista tablas:

```bash
docker compose exec db psql -U usr_cnt -d cr360
\dt
```

4. Verifica tablas de una app (ejemplo `customers`):

```sql
\dt *customers*
```

> Si `\dt` no muestra nada, normalmente faltan migraciones o el backend no pudo conectarse a DB.


> Nota (PowerShell/Windows): usa `-U usr_cnt -d cr360` o reemplaza manualmente por tus valores de `.env`.
> Evita escribir variables con espacios (por ejemplo `${DB USER...}`), porque rompe el comando y aparece el error `role "-d" does not exist`.

### Paso a paso: ¿Docker CLI o pgAdmin?
Puedes hacerlo de **las dos formas**. Recomendado primero validar en Docker CLI y luego revisar en pgAdmin.

#### Opción A (recomendada): Docker CLI
Ejecuta estos comandos en una terminal ubicada en la raíz del proyecto (donde está `docker-compose.yml`):

```bash
# 1) Levantar servicios
docker compose up -d --build

# 2) Confirmar que estén arriba
docker compose ps

# 3) Crear tablas (migraciones)
docker compose exec backend python manage.py migrate

# 4) Entrar a PostgreSQL
docker compose exec db psql -U usr_cnt -d cr360

# 5) Ya dentro de psql, listar tablas
\dt

# 6) Filtrar por tablas de clientes
\dt *customers*
```

#### Opción B: pgAdmin (interfaz gráfica)
1. Abre pgAdmin y crea un **Server** nuevo.
2. En **Connection** usa:
   - Host: `localhost`
   - Port: `5432`
   - Maintenance DB: `cr360` (o el valor de `DB_NAME`)
   - Username: `usr_cnt` (o el valor de `DB_USER`)
   - Password: `usr_cnt` (o el valor de `DB_PASSWORD`)
3. Guarda y conecta.
4. Navega a: **Servers → tu servidor → Databases → cr360 → Schemas → dev → Tables**.
5. Si no ves tablas, vuelve a correr migraciones con Docker (paso A.3).

6. En este proyecto las tablas se crean en el esquema `dev` (no en `public`).
7. Si quieres validarlo por SQL en `psql`:

```sql
SELECT current_schema();
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'dev' ORDER BY tablename;
```

8. Opcional: dejar `dev` como esquema por defecto en tu sesión:

```sql
SET search_path TO dev, public;
```

> Resumen rápido: para **ejecutar migraciones** usa Docker (`backend`); para **visualizar tablas** puedes usar Docker (`psql`) o pgAdmin.

### Validar módulo de Clientes (paso a paso)
1. Abre `http://localhost:3000/customers.html`.
2. Verifica en consola del navegador que `GET /api/organizations/` responda 200.
3. Si no existe ninguna organización, el frontend ahora crea automáticamente una llamada **"Organización Principal"** para permitir continuar con el flujo de clientes.
4. Completa el formulario **Nuevo cliente** y guarda.
5. Verifica en PostgreSQL:

```sql
SELECT id, name, slug FROM dev.organization ORDER BY id;
SELECT id, code, legal_name, organization_id FROM dev.customers_customer ORDER BY id DESC LIMIT 20;
```

### 4) Comandos útiles
- Ejecutar migraciones manuales:

```bash
docker compose exec backend python manage.py migrate
```

- Crear superusuario:

```bash
docker compose exec backend python manage.py createsuperuser
```

- Ver logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

- Detener servicios:

```bash
docker compose down
```

- Borrar volúmenes (reinicio limpio de BD):

```bash
docker compose down -v
```

## Frontend moderno incluido
- Navbar limpia con CTA.
- Hero section con estética moderna (gradientes, glass effect).
- Tarjeta de KPIs financieros.
- Bloques de funcionalidades.
- Sección de pricing (Starter/Growth/Pro).

Este frontend es un punto de partida rápido para evolucionar a React/Next.js cuando quieras más interacción.

## Recomendación de modularidad SaaS

### Fase 1: Modular Monolith (actual)
- `tenants`: organizaciones, membresía, suscripciones.
- `finance`: categorías, transacciones, reportes.
- `core`: utilidades transversales, permisos, auditoría.

### Fase 2: Separación por servicios
- `identity-service`
- `billing-service`
- `ledger-service`
- `notifications-service`

### Fase 3: Comercialización y crecimiento
1. **Pricing por niveles:** Starter / Growth / Pro.
2. **Upsells:** conciliación bancaria, IA para flujo de caja, proyección fiscal.
3. **Adquisición:** trial de 14 días + plantillas por rubro + partners contables.
4. **Retención:** reportes semanales automáticos y alertas de anomalías.
5. **North Star metric:** % de empresas activas con movimientos semanales.

## Módulos solicitados y propuesta de empaquetado

### Módulos funcionales
1. **Clientes**
2. **Proveedores**
3. **Agenda**
4. **Reportes**
5. **Facturación**
6. **Inventario**
7. **Marketing automático**
8. **Fidelización de clientes**

### Cómo venderlo por módulos (recomendación SaaS)

#### Plan Free (0 USD)
- Clientes (límite de registros)
- Proveedores (límite de registros)
- Agenda básica
- 1 usuario

#### Plan Base (suscripción mensual)
- Todo Free + Reportes básicos
- Facturación básica
- Hasta 3 usuarios

#### Plan Growth (suscripción mensual)
- Todo Base + Inventario
- Reportes avanzados
- Automatizaciones simples de marketing
- Hasta 10 usuarios

#### Plan Pro (suscripción mensual)
- Todo Growth + Fidelización completa
- Marketing automático avanzado
- Roles avanzados y multi-sucursal
- API e integraciones

#### Add-ons por módulo
Si un cliente necesita funcionalidades puntuales, activa módulos adicionales como complementos:
- Inventario
- Marketing automático
- Fidelización
- Facturación avanzada

## Base técnica para monetizar por módulos

Se agregó el app `platform` para soportar comercialización SaaS por módulos:
- `SaaSModule`: catálogo de módulos.
- `Plan`: planes (free, base, growth, pro).
- `PlanModule`: qué módulo incluye cada plan.
- `OrganizationPlan`: plan activo por empresa.
- `OrganizationModuleAddon`: módulos extra comprados por empresa.

Con esta base podrás:
- vender por plan,
- vender por módulo,
- y combinar ambos modelos según el tipo de cliente.

## Autenticación (nuevo)
El frontend ahora incluye:
- Opción de **Iniciar sesión** en el menú.
- Formulario de **login**.
- Formulario de **registro**.
- Botones de acceso con **Google (Gmail)** y registro normal por correo.

> Nota: la integración real de OAuth con Google en backend se implementa en el siguiente paso (por ejemplo con `django-allauth` + credenciales OAuth de Google Cloud).


## Estructura frontend (mantenible y reutilizable)

```text
services/frontend
├── index.html
├── auth/
│   ├── login.html
│   └── register.html
├── assets/
│   ├── css/
│   │   ├── base.css
│   │   ├── components.css
│   │   └── pages/
│   │       ├── home.css
│   │       └── auth.css
│   └── js/
│       ├── main.js
│       └── auth.js
├── nginx.conf
└── Dockerfile
```

Con esta estructura:
- Los estilos globales están en `base.css`.
- Componentes reutilizables (`botones`, `cards`, `navbar`) en `components.css`.
- Estilos por pantalla en `pages/`.
- Lógica JS separada por contexto (`main.js`, `auth.js`).
