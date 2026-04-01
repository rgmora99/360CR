# 360CR - Base Django + PostgreSQL

Estructura base para iniciar **360CR** como plataforma SaaS enfocada en emprendedores y pymes para controlar ingresos y gastos.

## Objetivo
Construir una base modular por dominios para evolucionar a arquitectura por servicios sin romper todo el sistema.

## Stack inicial
- Django 5 + Django REST Framework
- PostgreSQL 16
- Docker Compose

## Estructura del proyecto

```text
.
├── docker-compose.yml
├── .env.example
└── services
    └── backend
        ├── config/                # settings globales
        ├── apps/
        │   ├── core/             # utilidades transversales
        │   ├── tenants/          # multi-tenant (organización/suscripción)
        │   └── finance/          # ingresos, gastos, categorías
        ├── manage.py
        ├── requirements.txt
        └── Dockerfile
```

## Levantar el proyecto

1. Copia variables de entorno:

```bash
cp .env.example .env
```

2. Levanta los servicios:

```bash
docker compose up --build
```

3. Prueba healthcheck:

```bash
curl http://localhost:8000/health/
```

## Recomendación de modularidad (ruta de crecimiento)

### Fase 1 (actual): Modular Monolith
Mantén un solo backend, pero separando dominios por apps:
- `tenants`: clientes/organizaciones/planes.
- `finance`: libro diario, categorías, reportes.
- `core`: auditoría, permisos, utilidades.

### Fase 2: Servicios independientes
Cuando haya escala, separa sin reescribir todo:
- `identity-service` (usuarios, auth, roles)
- `billing-service` (suscripción, facturación, pagos)
- `ledger-service` (ingresos/gastos/reportes)
- `notifications-service` (email, WhatsApp, recordatorios)

### Fase 3: Integraciones
- Pasarela de pago (Stripe/Mercado Pago)
- Facturación electrónica por país
- Integración bancaria/Open Banking

## Sugerencias para modelo SaaS comercializable

1. **Pricing por niveles**
   - Starter: control básico de caja.
   - Growth: reportes, presupuestos, alertas.
   - Pro: multi-sucursal, analítica avanzada, API.

2. **Upsells claros**
   - Asistente de flujo de caja con IA.
   - Proyecciones de impuestos.
   - Conciliación bancaria automática.

3. **Modelo de adquisición**
   - Prueba gratis 14 días.
   - Plantillas por rubro (restaurante, retail, servicios).
   - Programa de partners con contadores/asesores.

4. **Retención**
   - Reporte semanal automático al dueño.
   - Alertas de gastos atípicos.
   - Objetivos de margen y ahorro con seguimiento.

5. **Métrica clave**
   - North Star: `% de empresas activas que registran movimientos cada semana`.
