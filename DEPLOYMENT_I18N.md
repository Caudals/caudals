# Deployment Notes - Internacionalización

## Cambios Importantes para Dokploy

Se ha mejorado el sistema de internacionalización para que funcione correctamente en Dokploy (self-hosting) y detecte automáticamente usuarios en España.

### ¿Qué cambió?

1. **Geolocalización por IP**: Ahora el sistema detecta el país del usuario usando su dirección IP, no depende de headers específicos de Vercel.

2. **Detección robusta en Safari y móviles**: Mejoras específicas para Safari y dispositivos móviles.

3. **Priorización de país sobre idioma**: Si detecta que estás en España, fuerza español automáticamente.

## Pasos para Deployment en Dokploy

### 1. Hacer Build Local (Opcional - Verificación)

```bash
npm run build
```

Verifica que no hay errores de compilación.

### 2. Commit y Push

```bash
git add .
git commit -m "Fix: Mejorar sistema i18n para self-hosting y Safari/móviles"
git push origin main
```

### 3. Rebuild en Dokploy

En tu panel de Dokploy:
1. Ve a tu aplicación
2. Haz clic en "Rebuild"
3. Espera a que complete el deployment

### 4. Verificar el Deployment

Después del rebuild, verifica:

1. **Desde España (o con VPN española)**:
   - Abre tu sitio en Chrome → debería estar en español ✓
   - Abre tu sitio en Safari → debería estar en español ✓
   - Abre en móvil (Safari iOS) → debería estar en español ✓
   - Abre en móvil (Chrome Android) → debería estar en español ✓

2. **Desde otro país**:
   - Debería estar en inglés por defecto
   - Si el navegador está en español → español
   - Si el navegador está en inglés → inglés

3. **Verifica logs** (opcional):
   - Abre la consola del navegador (F12)
   - Busca logs con prefijo `[i18n]`
   - Deberías ver algo como:
     ```
     [i18n] Client IP: xxx.xxx.xxx.xxx
     [i18n] Country from IP: ES
     [i18n] Detected locale from country (ES): es
     ```

## Variables de Entorno

No se requieren nuevas variables de entorno. El sistema usa servicios gratuitos de geolocalización:
- `ipapi.co` (30k requests/mes gratis)
- `ip-api.com` (45 requests/min gratis)

## Consideraciones de Performance

- **Primera visita**: +50-200ms (llamada API de geolocalización)
- **Visitas posteriores**: 0ms (usa cookie cacheada)
- **Cache de servidor**: 1 hora por IP
- **Cache de cliente**: 24 horas en localStorage

## Rate Limits

Con 10,000 usuarios únicos/mes:
- Requests de geolocalización: ~10,000
- Límite gratuito: 30,000/mes
- **Margen de seguridad**: 66% libre

Si llegas al límite, considera:
1. Aumentar el cache time en `lib/i18n/geolocation.ts`
2. Usar un servicio premium
3. Implementar tu propia base de datos de geolocalización

## Troubleshooting

### Problema: Sigue apareciendo en inglés desde España

**Solución 1**: Limpiar cookies y localStorage
```javascript
// En la consola del navegador
document.cookie = "NEXT_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
localStorage.clear();
location.reload();
```

**Solución 2**: Verificar que Dokploy está pasando la IP correctamente
- Revisa los logs del servidor de Dokploy
- Busca `[i18n] Client IP`
- Si muestra `127.0.0.1` o `localhost`, hay un problema con el proxy

**Solución 3**: Verificar firewall/proxy
- Asegúrate de que Dokploy puede hacer requests HTTPS salientes
- Los servicios de geolocalización necesitan acceso a internet

### Problema: "Failed to fetch" en geolocalización

**Causa**: Firewall bloqueando requests salientes

**Solución**: En Dokploy, permite conexiones HTTPS salientes a:
- `ipapi.co`
- `ip-api.com`

### Problema: Demasiados requests de geolocalización

**Solución**: Aumentar el cache time en `lib/i18n/geolocation.ts`:

```typescript
// Línea ~36
next: { revalidate: 86400 }, // 24 horas en lugar de 1 hora
```

## Logging en Producción

Los logs de `[i18n]` están activos por defecto. Esto es útil para:
- Monitorear de dónde vienen tus usuarios
- Detectar problemas de detección
- Debug en producción

Si prefieres desactivarlos, hay dos opciones:

### Opción 1: Remover todos los console.log de i18n

```bash
# Buscar archivos con logs de i18n
grep -r "console.log.*\[i18n" lib/i18n/

# Comentar o eliminar manualmente
```

### Opción 2: Usar una variable de entorno

Agregar en Dokploy:
```bash
I18N_DEBUG=false
```

Y modificar el código para condicionar los logs (requiere cambios adicionales).

**Recomendación**: Dejarlos activos. Solo aparecen en la consola, no afectan al usuario final ni al rendimiento.

## Component de Debug (Desarrollo)

Durante el desarrollo, puedes usar el componente de debug:

```tsx
// En app/layout.tsx o cualquier página
import { LocaleDebug } from "@/components/debug/locale-debug";

<LocaleDebug currentLocale={locale} />
```

Esto muestra un botón flotante solo en desarrollo con toda la info de i18n.

## Next Steps (Opcional)

1. **Agregar selector manual de idioma**: 
   - UI para que usuarios cambien idioma manualmente
   - Función `setLocale()` ya disponible en `client-locale-detector.tsx`

2. **Persistir preferencia en DB**:
   - Para usuarios autenticados
   - Sincronizar entre dispositivos

3. **Más idiomas**:
   - Agregar francés, alemán, etc.
   - Actualizar `lib/i18n/config.ts`

4. **Analytics de idiomas**:
   - Trackear qué idiomas son más usados
   - Usar los logs de `[i18n]`

## Contacto de Soporte

Si tienes problemas después del deployment:

1. Revisa los logs de Dokploy
2. Revisa la consola del navegador (busca `[i18n]`)
3. Usa `<LocaleDebug />` en development
4. Verifica que las APIs de geolocalización están respondiendo:
   - https://ipapi.co/json/
   - http://ip-api.com/json/

## Checklist de Deployment

- [ ] Código commiteado y pusheado
- [ ] Rebuild en Dokploy completado
- [ ] Verificado en Chrome (España)
- [ ] Verificado en Safari (España)
- [ ] Verificado en móvil iOS
- [ ] Verificado en móvil Android
- [ ] Verificado desde otro país (inglés por defecto)
- [ ] No hay errores en la consola
- [ ] Imágenes de Supabase Storage funcionan correctamente
- [ ] Todo funciona como esperado ✓

---

**Nota**: Este deployment incluye también el fix para las imágenes de Supabase (`unoptimized: true` en `next.config.js`). Ambos problemas deberían estar resueltos después del rebuild.

