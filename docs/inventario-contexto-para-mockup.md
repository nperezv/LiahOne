# Inventario actual (pies y cabeza)

Este documento aterriza, de forma operativa, **qué existe hoy**, **dónde se hace cada cosa** y **qué falta** para que no se pierda el hilo del módulo de inventario.

---

## 0) Resumen ejecutivo (30 segundos)

Hoy el sistema **sí soporta**:
- Dar de alta **categorías**.
- Dar de alta **ubicaciones** (capilla/armarios/estantes) con jerarquía.
- Dar de alta **equipos/objetos** (items) asignando categoría y ubicación.
- Generar y abrir **QR** de item y generar etiquetas PDF de item/ubicación.
- Registrar **NFC** para item y ubicación.
- Mover items por formulario manual, por QR/código o por NFC.
- Auditar inventario por escaneo.

El problema principal no es “que no exista backend”, sino que la UX no lo muestra de forma lineal y obvia.

---

## 1) Dónde está cada cosa (frontend)

### 1.1 Rutas del módulo inventario
- `/inventory` → pantalla principal (scanner, mover, bind NFC, listado)
- `/inventory/new` → alta de equipo/objeto (item)
- `/inventory/audit` → auditoría
- `/inventory/locations` → árbol de ubicaciones
- `/inventory/locations/:locationCode` → detalle ubicación (incluye registrar NFC ubicación)
- `/inventory/:assetCode` → detalle item (incluye mover, ver QR, imprimir etiqueta)
- `/a/:assetCode` → vista pública mínima del item
- `/loc/:locationCode` → detalle ubicación (alias)

### 1.2 “Quiero dar de alta …”

#### A) Dar de alta **categorías** (ej: Audio, Limpieza, Oficina)
No hay pantalla dedicada hoy en navegación principal, pero sí existe API/hook:
- Hook: `useCreateInventoryCategory`
- Endpoint: `POST /api/inventory/categories`

#### B) Dar de alta **armarios/estantes/ubicaciones**
- Lista/árbol: `/inventory/locations`
- Detalle ubicación: `/inventory/locations/:locationCode`
- Alta por API/hook:
  - Hook: `useCreateInventoryLocation`
  - Endpoint: `POST /api/inventory/locations`

> Nota: la UI actual prioriza navegación y gestión de nodos existentes; el alta directa depende de flujo admin/API actual.

#### C) Dar de alta **equipos/objetos**
- UI: `/inventory/new`
- Hook: `useCreateInventoryItem`
- Endpoint: `POST /api/inventory`
- Campos: nombre, descripción, categoría, ubicación, estado, tracker, foto.

---

## 2) Cómo se genera el QR y etiquetas (lo que pediste explícitamente)

### 2.1 QR de item
- Al crear item, backend guarda `qrUrl` con la URL pública del activo (`/a/:assetCode`).
- Endpoint de imagen QR PNG: `GET /inventory/qr/:assetCode`.

### 2.2 Etiqueta PDF de item
- Endpoint: `GET /inventory/label/:assetCode`.
- Genera una etiqueta circular en PDF con código + QR.

### 2.3 Etiqueta PDF de ubicación (armario/estante)
- Endpoint: `GET /inventory/location-label/:locationCode`.
- Genera etiqueta rectangular PDF con código + QR de la ubicación.

### 2.4 Lote de etiquetas
- Endpoint: `GET /inventory/labels/batch?assetCodes=A-0001,A-0002`.

## 2.5 Prefijos dinámicos por barrio (ABM8 / VBM8)
- Ya no debe depender de hardcode fijo: el backend obtiene las siglas del barrio desde configuración (`pdf_templates.ward_name`).
- Si el barrio es `Barrio Madrid 8`, el código base de barrio queda `BM8`.
- Al generar `asset_code`, el sistema compone: `prefijo_categoria + wardCode + secuencia` (ej. `A` + `BM8` + `-0001` => `ABM8-0001`).
- Si cambias el barrio en configuración, los nuevos códigos se adaptan al nuevo `wardCode` automáticamente.

---

## 3) Flujo real end-to-end que hoy sí existe

1. Crear categoría (si no existe) → API categoría.
2. Crear ubicación (capilla/armario/estante) → API ubicación.
3. Crear item/equipo en `/inventory/new`.
4. Abrir detalle del item `/inventory/:assetCode`.
5. Imprimir etiqueta del item (`/inventory/label/:assetCode`).
6. (Opcional) Imprimir etiqueta de ubicación (`/inventory/location-label/:locationCode`).
7. Registrar NFC del item (`/inventory/nfc/register-item`).
8. Registrar NFC de la ubicación (`/inventory/nfc/register-location`).
9. Mover por NFC (item → ubicación) o por QR/manual.
10. Auditar por escaneo en `/inventory/audit`.

---

## 4) Backend: entidades y reglas de negocio

### 4.1 Entidades clave
- `inventory_categories` (name, prefix)
- `inventory_category_counters` (secuencia para asset code)
- `inventory_locations` (name, code, parentId)
- `inventory_items` (assetCode, categoryId, locationId, status, qrUrl, ...)
- `inventory_movements`
- `inventory_loans`
- `inventory_audits` + `inventory_audit_items`
- `inventory_nfc_links` (uid ↔ target item/location)

### 4.2 Reglas automáticas
- `asset_code` = prefijo categoría + secuencia (`PREFIX-0001`).
- `location_code` autogenerable (`LOC-<ward>-<type>-NN`).
- Cada movimiento registra historial y actualiza ubicación actual del item.
- UID NFC es único: si existe, devuelve conflicto.

---

## 5) Roles y permisos (importante)

- Lectura inventario: `obispo`, `consejero_obispo`, `bibliotecario`.
- Alta (categorías, ubicaciones, items): `obispo`, `consejero_obispo`.
- Operación (movimientos y NFC): admin + `bibliotecario`.

---

## 6) Mapa rápido: “qué archivo toca qué”

### Front
- Rutas inventario: `client/src/App.tsx`
- Pantalla principal: `client/src/pages/inventory.tsx`
- Alta item: `client/src/pages/inventory-new.tsx`
- Detalle item: `client/src/pages/inventory-detail.tsx`
- Ubicaciones: `client/src/pages/inventory-locations.tsx`
- Detalle ubicación: `client/src/pages/inventory-location-detail.tsx`
- Auditoría: `client/src/pages/inventory-audit.tsx`
- Scanner QR: `client/src/components/inventory-scanner.tsx`
- Scanner NFC: `client/src/hooks/use-nfc-scanner.ts`
- Hooks API inventario: `client/src/hooks/use-api.ts`

### Back
- Lógica inventario + QR + etiquetas + NFC + auditoría:
  - `server/inventory-routes.ts`
- Modelo de datos:
  - `shared/schema.ts`

---

## 7) Qué está confuso ahora (y por qué parece que “no está”)

- Alta de categorías/ubicaciones no está tan visible en UX principal como debería.
- Existen endpoints potentes de QR/NFC/etiquetas, pero el usuario no ve un “wizard operativo” de principio a fin.
- Se mezclan tareas en la pantalla principal sin una narrativa clara de operación diaria.

---

## 8) Prompt refinado para ChatGPT (mockup funcional)

```txt
Actúa como Lead Product Designer + Senior Frontend Engineer.

Quiero rediseñar un módulo de inventario existente para que sea muy claro, lineal y operativo.

Objetivo:
- Que un usuario pueda completar sin confusión:
  1) alta de categorías,
  2) alta de ubicaciones (capilla/armarios/estantes),
  3) alta de equipos/objetos,
  4) impresión de etiquetas QR,
  5) asociación NFC item y ubicación,
  6) movimientos,
  7) auditoría.

Contexto real actual:
- Frontend React + wouter + tanstack query + shadcn.
- Backend ya existe con endpoints para categorías, ubicaciones, items, movimientos, NFC, QR y etiquetas PDF.
- Rutas actuales: /inventory, /inventory/new, /inventory/audit, /inventory/locations, /inventory/locations/:locationCode, /inventory/:assetCode.
- NFC usa Web NFC (NDEFReader), no universal.
- Scanner QR tiene fallback manual.

Necesito entrega en este formato:
1) Arquitectura de información nueva.
2) Flujo maestro en 1 sola narrativa operativa diaria.
3) Wireframe textual por pantalla (mobile-first y desktop).
4) Diseño iOS-style (tokens, tipografía, spacing, estados, motion).
5) Especificación implementable por componentes React.
6) Tabla MVP vs V2.
7) Riesgos UX + mitigaciones.
8) Microcopy en español operativo.

Importante:
- Prioriza claridad por encima de “bonito”.
- Incluye una pantalla de “setup inicial” para no olvidar categorías/ubicaciones.
- Incluye CTA de “Imprimir etiqueta QR” y “Vincular NFC” justo después de crear item/ubicación.
```

---

## 9) Flujo inverso recomendado (NFC primero)

Para operación de campo, ahora se prioriza este flujo:
1. Tocar pegatina NFC para capturar UID.
2. Seleccionar categoría y completar nombre/descripción del activo.
3. Crear activo y vincular NFC en una sola acción.
4. Generar QR/etiqueta por activo y luego imprimir/pegar.

## 10) Estado actual del pedido

Lo que pediste (alta armarios/equipos/objetos por categorías + etiquetas QR + NFC + movimientos) **sí tiene base implementada**.
Lo pendiente es seguir refinando la UX guiada y controles de validación operativa.


## 11) Estructura UX actual recomendada (3 secciones)

1. **Inventario (dashboard):** KPIs, filtros por categoría y listado de activos.
2. **Registro:** alta de categorías, alta de activos por NFC inverso, alta de armarios/ubicaciones por NFC inverso, y flujo QR/etiqueta por activo.
3. **Auditoría:** acceso directo a auditoría de inventario, escaneo operativo y controles de verificación.

> Nota de nomenclatura: los activos usan prefijo de categoría + siglas de barrio (ej. `ABM8-0001`), y las ubicaciones usan código tipo `LOC-BM8-ARM-01` / `LOC-BM8-EST-01` autogenerado.
