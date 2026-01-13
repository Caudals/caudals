# Modo Landing Page

Este proyecto soporta un modo "landing page" que permite desplegar solo una landing page simple en lugar de la aplicación completa.

## ¿Cómo funciona?

Cuando `LANDING_MODE=true`, el middleware redirige todas las rutas (excepto las APIs y assets estáticos) a una landing page simple (`/landing-simple`) que incluye:

- Hero section con información sobre Caudals
- Sección de características
- Formulario de contacto (el mismo que está en `/collaborate`)

## Activar el modo Landing

### Opción 1: Variable de entorno en GitHub Secrets

1. Ve a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions
3. Añade un nuevo secret llamado `LANDING_MODE` con valor `true`
4. El workflow de GitHub Actions lo pasará automáticamente al build de Docker

### Opción 2: Variable de entorno en el contenedor Docker

Si estás ejecutando el contenedor directamente:

```bash
docker run -e LANDING_MODE=true ...
```

O en tu archivo de configuración de Docker Compose:

```yaml
environment:
  - LANDING_MODE=true
```

## Desactivar el modo Landing

Para volver a la aplicación completa:

1. Cambia `LANDING_MODE` a `false` en GitHub Secrets, o
2. Elimina la variable de entorno `LANDING_MODE` (por defecto es `false`)

## Rutas permitidas en modo Landing

Cuando `LANDING_MODE=true`, estas rutas siguen funcionando:

- `/api/*` - Todas las rutas de API (necesarias para el formulario de contacto)
- `/_next/*` - Assets estáticos de Next.js
- Archivos estáticos (imágenes, fuentes, etc.)

Todas las demás rutas redirigen a `/landing-simple`.

## Estructura

- **Landing simple**: `app/(home)/landing-simple/page.tsx`
- **Middleware**: `middleware.ts` (maneja las redirecciones)
- **Dockerfile**: Acepta `LANDING_MODE` como build arg
- **GitHub Actions**: Pasa `LANDING_MODE` desde secrets

## Notas

- La aplicación completa sigue estando en el código, solo está oculta cuando `LANDING_MODE=true`
- El formulario de contacto usa la misma API (`/api/collaborations`) que la app completa
- La localización (i18n) funciona normalmente en modo landing
