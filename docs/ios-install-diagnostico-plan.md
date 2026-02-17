# Diagnóstico iOS: instalación de la app y rotación

## Resumen ejecutivo

Se revisó la configuración actual de la app como **PWA** (no app nativa con Xcode/IPA). El bloqueo principal para una instalación más consistente en iOS era que los iconos para instalación estaban configurados en **SVG**, mientras iOS espera assets en PNG para `apple-touch-icon`. Además, el manifiesto forzaba orientación `portrait-primary`, por lo que la rotación quedaba deshabilitada.

## Checklist de requisitos iOS (PWA) y cumplimiento actual

| Requisito | Estado antes | Estado actual | Evidencia |
|---|---|---|---|
| Servir por HTTPS | ✅ Presumiblemente OK en producción | ✅ Sin cambios | Validar en entorno productivo |
| `manifest.json` enlazado | ✅ | ✅ | `client/index.html` |
| `display: standalone` | ✅ | ✅ | `client/public/manifest.json` |
| Iconos adecuados para instalación | ⚠️ SVG (riesgo en iOS) | ✅ PNG 192/512 en manifest + PNG para Apple touch icon | `client/public/manifest.json`, `client/index.html` |
| `apple-mobile-web-app-capable` | ✅ | ✅ | `client/index.html` |
| Service Worker registrado | ✅ | ✅ | `client/index.html`, `client/public/sw.js` |
| Cache básico de app shell | ✅ | ✅ (actualizado a PNG) | `client/public/sw.js` |
| Orientación habilitada | ❌ Forzada a portrait | ✅ `orientation: any` | `client/public/manifest.json` |
| Instalación por navegador iOS | ⚠️ Limitada por Safari (A2HS manual) | ⚠️ Igual (limitación plataforma) | Limitación de iOS/Safari |

## Hallazgos técnicos (por qué no se instalaba bien en iOS)

1. **Iconos en SVG para iOS**
   - iOS no siempre usa correctamente SVG para `apple-touch-icon`.
   - Esto puede causar que el flujo “Agregar a pantalla de inicio” falle o muestre icono incorrecto.

2. **Manifiesto con orientación bloqueada**
   - `orientation: portrait-primary` desactiva rotación funcional de la experiencia instalada.

3. **Expectativas de instalación en iOS**
   - iOS no ofrece exactamente el mismo prompt de instalación que Android.
   - En Safari se instala manualmente desde compartir → “Agregar a pantalla de inicio”.

## Cambios aplicados en este ciclo

1. Manifest actualizado a orientación flexible:
   - `orientation: any`.
2. Íconos del manifest migrados a PNG (`192x192`, `512x512`) con `purpose: any maskable`.
3. `apple-touch-icon` en `index.html` migrado de SVG a PNG (`152/167/180`).
4. Service Worker actualizado para cachear y usar PNG para icono/badge de notificaciones.

## Plan senior fullstack de mejora (priorizado)

### Fase 1 — Estabilidad de instalación iOS (rápida)

- [ ] Verificar en iPhone real (Safari) flujo completo de A2HS.
- [ ] Confirmar que el icono en home screen sea el esperado.
- [ ] Confirmar lanzamiento en standalone sin barras del navegador.
- [ ] Documentar guía corta para usuarios (2-3 pasos con capturas).

### Fase 2 — Rotación y UX responsive

- [ ] Probar vistas críticas en landscape: dashboard, calendario, entrevistas, reportes.
- [ ] Corregir layouts con overflow horizontal o sidebars rígidas.
- [ ] Definir breakpoints y reglas para landscape móvil (top nav compacta, tablas scrollables).
- [ ] Añadir pruebas visuales/manuales por orientación.

### Fase 3 — Robustez PWA en iOS

- [ ] Añadir estrategia de versionado de cache más estricta (hash por release).
- [ ] Definir fallback offline explícito (`/offline`) con UI amigable.
- [ ] Revisar tamaño de íconos y splash screens opcionales para iOS.
- [ ] Evaluar migración a plugin PWA de Vite para mejor control de manifest/SW.

### Fase 4 — Si se requiere “instalación nativa real”

Si el objetivo es distribuir por TestFlight/App Store:

- [ ] Envolver frontend con Capacitor.
- [ ] Generar proyecto iOS (`npx cap add ios`) y abrir en Xcode.
- [ ] Configurar signing, bundle id, permisos y capabilities.
- [ ] Pipeline de build/release con TestFlight.

## Riesgos y dependencias

- iOS impone limitaciones de PWA (instalación manual, soporte parcial en algunas APIs).
- El backend debe mantenerse estable por HTTPS para asegurar comportamiento instalable.
- Cambios de rotación pueden requerir refactor de componentes con layouts rígidos.


## Nota específica para Android (rotación no cambia tras deploy)

Si en Android no rota aunque el manifest diga `"orientation": "any"`, normalmente es por **cache del manifest / WebAPK antiguo**.

Checklist rápido:
- Desinstalar la app PWA instalada del home screen.
- En Chrome Android: borrar datos del sitio (Storage + service worker).
- Abrir de nuevo la URL y reinstalar.
- Confirmar que la rotación del sistema no esté bloqueada.

Además, en este ajuste se subió el versionado de cache/manifest (`v4`) para forzar actualización de clientes que venían con `v3`.
