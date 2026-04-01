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

### 3) Levantar todo el stack

```bash
docker compose up --build
```

Servicios disponibles:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000/health/
- PostgreSQL: localhost:5432

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
