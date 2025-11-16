# Sistema de Internacionalización (i18n)

## Descripción General

Sistema robusto de detección y gestión de idiomas que funciona en cualquier plataforma (Vercel, Dokploy, AWS, etc.) y en todos los navegadores y dispositivos.

## Características

- ✅ **Detección automática por país**: Usa geolocalización por IP
- ✅ **Compatible con self-hosting**: Funciona sin headers específicos de plataforma
- ✅ **Funciona en todos los navegadores**: Chrome, Safari, Firefox, Edge
- ✅ **Compatible con móviles y tablets**: iOS, Android
- ✅ **Detección multi-capa**: Cookie → País → LocalStorage → Idioma del navegador
- ✅ **Caché inteligente**: Reduce llamadas a APIs de geolocalización
- ✅ **Fallbacks robustos**: Múltiples servicios de geolocalización

## Prioridad de Detección

### Servidor (Middleware)
1. **Cookie existente** (respeta preferencia del usuario)
2. **País = España** → fuerza español (señal más fuerte)
3. **País detectado** → idioma correspondiente
4. **Header Accept-Language** → idioma del navegador
5. **Default** → inglés

### Cliente
1. **Cookie** (ya establecida por el servidor)
2. **País detectado por IP** (España → español)
3. **LocalStorage** (backup si cookies bloqueadas)
4. **Navigator.languages** (todos los idiomas preferidos)
5. **Default** → inglés

## Componentes Principales

### 1. `geolocation.ts`
Servicio de detección de país por IP que funciona en entornos self-hosted.

**Servicios usados:**
- Primary: `ipapi.co` (30k requests/mes, gratis)
- Fallback: `ip-api.com` (45 requests/min, gratis)

**Caché:** Los resultados se cachean por 1 hora en el servidor.

### 2. `middleware.ts`
Detecta el idioma en cada request y establece la cookie.

**Lógica especial:**
- Si detecta que el usuario está en España (ES) → **siempre fuerza español**
- Primera visita → establece idioma detectado
- Visitas posteriores → respeta cookie (preferencia usuario)

### 3. `client-locale-detector.tsx`
Detección del lado del cliente como fallback.

**Incluye:**
- Detección de país por IP desde el navegador
- Caché de 24 horas en localStorage
- Compatibilidad con Safari/móviles

### 4. `detect-locale.ts`
Lógica compartida de detección de idioma.

**Mejoras:**
- Prioriza país sobre idioma del navegador
- Logging detallado para debug

### 5. `server.ts`
Funciones para obtener traducciones en el servidor.

**Mejoras:**
- Usa geolocalización por IP si no hay headers de plataforma
- Compatible con cualquier proveedor de hosting

## Configuración para Producción

### Opción 1: Mantener logs (recomendado para monitoreo)
Los logs tienen el prefijo `[i18n]` para facilitar filtrado. Son útiles para:
- Detectar problemas de detección de idioma
- Monitorear qué usuarios acceden desde dónde
- Debug en producción

### Opción 2: Remover logs en producción
Si prefieres no tener logs en producción, busca y reemplaza:

```bash
# Buscar todos los console.log de i18n
grep -r "console.log.*\[i18n" lib/i18n/

# O usar el componente de debug solo en desarrollo (ya incluido)
```

Los logs solo afectan la consola del navegador/servidor, no el rendimiento.

## Uso del Componente de Debug

En desarrollo, puedes ver toda la información de detección:

```tsx
import { LocaleDebug } from "@/components/debug/locale-debug";

// En tu layout o página (solo visible en development)
<LocaleDebug currentLocale={locale} />
```

Esto mostrará un botón flotante "🌍 i18n Debug" que al hacer clic muestra:
- Locale actual
- Cookie y LocalStorage
- País detectado
- Idiomas del navegador
- Y más...

## Headers Soportados

El sistema detecta automáticamente el país de múltiples fuentes:

### Headers de Plataforma (si están disponibles)
- `x-vercel-ip-country` (Vercel)
- `cf-ipcountry` (Cloudflare)
- `x-country-code` (genérico)
- `cloudfront-viewer-country` (AWS CloudFront)
- `x-forwarded-country` (proxies)

### Fallback por IP (para Dokploy y otros)
Si no hay headers, extrae la IP de:
- `x-forwarded-for`
- `x-real-ip`
- `cf-connecting-ip`
- `x-client-ip`
- `true-client-ip`

Y consulta servicios de geolocalización.

## Comportamiento Especial para España

Cuando el sistema detecta que un usuario está en España (código de país "ES"):

1. **Primera visita**: Establece español automáticamente
2. **Visitas posteriores**: Si la cookie NO es español, la sobrescribe a español
3. **Razón**: Usuario en España probablemente quiere español, independientemente de configuración del navegador

Esto asegura que usuarios en España siempre vean español, incluso si:
- Tienen el navegador en inglés
- Usan VPN
- Acceden desde diferentes dispositivos

## Testing

### Local
```bash
# El sistema detectará "localhost" o IPs locales y no hará llamadas de geolocalización
npm run dev
```

### Producción (Dokploy)
```bash
# El sistema usará la IP real del cliente para detectar el país
# Verificar en logs: [i18n] Client IP: x.x.x.x
# Verificar en logs: [i18n] Country from IP: ES
```

### Simular diferentes países
Para testing, puedes:

1. Usar VPN
2. Modificar temporalmente el middleware para forzar un país:
```typescript
// En middleware.ts, después de la línea 60
const countryCode = "ES"; // Fuerza España para testing
```

3. Usar el componente LocaleDebug para ver qué está detectando

## Solución de Problemas

### Safari no detecta español
- ✅ **Solucionado**: Ahora usa geolocalización por IP desde el cliente
- ✅ **Solucionado**: Cookies más compatibles con Safari
- ✅ **Solucionado**: Usa navigator.languages en lugar de solo navigator.language

### Móviles no detectan español
- ✅ **Solucionado**: Geolocalización funciona en todos los dispositivos
- ✅ **Solucionado**: LocalStorage como backup si cookies bloqueadas
- ✅ **Solucionado**: Detección mejorada de variantes de español

### Dokploy no tiene headers de país
- ✅ **Solucionado**: Usa geolocalización por IP directamente
- ✅ **Solucionado**: Múltiples servicios de fallback

### El idioma cambia inesperadamente
- Verifica los logs de `[i18n]` en la consola
- Usa `<LocaleDebug />` en desarrollo
- Verifica que la cookie está siendo establecida correctamente

## Límites de API

### ipapi.co
- **Gratis**: 30,000 requests/mes
- **Rate limit**: ~1,000 req/día
- **Timeout**: 2 segundos
- **Cache**: 1 hora (servidor)

### ip-api.com (fallback)
- **Gratis**: 45 requests/minuto
- **Rate limit**: Sí
- **Timeout**: 2 segundos

**Estimación**: Para 10,000 visitas/mes con cache de 1 hora:
- Requests únicos: ~10,000 (primera visita de cada usuario)
- Bien dentro del límite gratuito

Si necesitas más, considera:
- Aumentar el cache time a 24 horas
- Usar un servicio premium
- Cachear resultados por IP en una base de datos

## Rendimiento

- **Primera carga (sin cookie)**: +50-200ms (llamada de geolocalización)
- **Cargas posteriores (con cookie)**: 0ms (usa cookie)
- **Con cache de geolocalización**: <5ms (lectura de cache)

El impacto es mínimo y solo afecta la primera visita de nuevos usuarios.

## Mantenimiento

### Actualizar servicios de geolocalización
Si un servicio deja de funcionar, edita `lib/i18n/geolocation.ts` y:
1. Cambia la URL del servicio
2. Ajusta el parsing del response
3. Actualiza esta documentación

### Agregar nuevo idioma
1. Agrega el código en `lib/i18n/config.ts`:
```typescript
export const locales = ["en", "es", "fr"] as const;
```

2. Crea el archivo de traducciones: `lib/i18n/fr.json`

3. Actualiza `detect-locale.ts` si necesitas lógica especial de país

## Arquitectura

```
┌─────────────────────────────────────────────┐
│           Usuario hace request              │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              Middleware                     │
│  1. Lee cookie                              │
│  2. Detecta país (headers o IP)             │
│  3. Establece/actualiza cookie              │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│           Server Components                 │
│  - Lee cookie                               │
│  - Renderiza en idioma correcto             │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│         ClientLocaleDetector                │
│  - Verifica detección del servidor          │
│  - Fallback a detección cliente si falla    │
│  - Usa geolocalización IP desde navegador   │
│  - Persiste en cookie + localStorage        │
└─────────────────────────────────────────────┘
```

## Mejoras Futuras (Opcionales)

- [ ] Agregar detección de timezone para mejorar precisión de país
- [ ] UI para cambiar idioma manualmente
- [ ] Persistir preferencia de idioma en base de datos (usuarios autenticados)
- [ ] Agregar más idiomas
- [ ] Usar Cloudflare Workers para geolocalización (si migras a Cloudflare)

## Contribuciones

Al modificar el sistema de i18n:
1. Mantén los logs con prefijo `[i18n]`
2. Actualiza esta documentación
3. Prueba en Safari, Chrome, Firefox
4. Prueba en móviles (iOS y Android)
5. Prueba con VPN (simular diferentes países)

