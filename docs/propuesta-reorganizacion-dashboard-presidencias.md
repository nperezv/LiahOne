# Propuesta de reorganización UX: Dashboard general vs Panel de Presidencia

## Resumen ejecutivo

La app ya tiene una base sólida, pero hoy conviven tres problemas de experiencia:

1. **Superposición de superficies principales** (Dashboard general, paneles por organización y paneles específicos por rol).
2. **Navegación duplicada en móvil** (sidebar + barra inferior con destinos que se pisan).
3. **Arquitectura de layout única para rutas muy distintas**, lo que vuelve difícil mantener claridad por contexto.

La solución recomendada es un modelo de navegación **“hub-and-spoke”**:

- **Hub:** un único `Dashboard` como portada orientada al rol.
- **Spokes:** paneles operativos por dominio (Presidencia de organización, Presupuesto, Entrevistas, etc.).
- **Sidebar = navegación completa**, **Bottom bar = accesos de alta frecuencia** (no espejo completo del sidebar).

---

## Diagnóstico (basado en el código actual)

### 1) Estructura de rutas y shell global

- Todas las rutas autenticadas comparten un único `Layout`, sin separar shell por tipo de contexto (global vs organización). Esto simplifica desarrollo pero diluye la jerarquía UX.
- Existen rutas paralelas con naturaleza distinta (`/dashboard`, `/presidency/:org`, `/secretary-dashboard`) bajo la misma estructura de navegación, sin “modo de trabajo” explícito.

### 2) Menú lateral (sidebar)

- El sidebar es extenso y mezcla navegación global con entradas por rol y por organización.
- “Presidencias” vive como grupo colapsable con subrutas por organización, pero compite con otras rutas que también actúan como panel principal (ej. `Dashboard`, `Panel Secretaría`).
- Hay dos entradas de “Entrevistas” con destinos distintos según rol; funcionalmente válido, pero cognitivamente confuso para continuidad de producto.

### 3) Navegación móvil

- La barra inferior fija define 4 accesos + “Más” (abre sidebar).
- El problema no es técnico, sino de IA: en móvil, usuarios reciben dos sistemas de navegación simultáneos con contenidos solapados.
- Actualmente “Organización/Directorio” en bottom bar depende del rol y para no-obispado puede llevar al panel de presidencia. Este comportamiento es útil, pero no está presentado como “modo organización”.

### 4) Dashboard vs panel de presidencia

- `Dashboard` ya funciona como tablero de resumen de barrio (indicadores transversales, cumpleaños, agenda).
- `PresidencyMeetingsPage` funciona como tablero operativo por organización (metas, presupuesto, recursos, miembros), es decir, **también es un dashboard**, pero temático.
- Esta dualidad es válida si se explicita como: **Dashboard global** + **Dashboard de dominio (organización)**.

---

## Decisión de producto recomendada

## 1) No crear “otro dashboard” paralelo

Mantén:

- **Dashboard (global, por rol):** siempre la portada post-login.
- **Panel de presidencia (de dominio):** mantenerlo como área de trabajo de cada organización.

La diferencia debe ser explícita en lenguaje y estructura:

- Renombrar visualmente “Presidencias” a **“Mi organización”** para líderes de organización.
- Para obispado/secretaría: **“Organizaciones”** (lista y acceso a paneles).

## 2) Modelo de navegación por capas

### Capa A: Navegación primaria

- Dashboard
- Agenda
- Tareas
- Módulos (menú “Más” / sidebar)

### Capa B: Navegación contextual de organización

Dentro de `/presidency/:org`, añadir un submenú tipo tabs:

- Resumen
- Reuniones
- Presupuesto
- Recursos
- Miembros

Así evitas que todo viva en un scroll gigante y mejoras escaneabilidad.

---

## Propuesta concreta para limpiar la app

## Fase 1 (impacto rápido, bajo riesgo)

1. **Definir arquitectura IA canónica (1 página de referencia):**
   - Qué va en dashboard global.
   - Qué va en panel organizacional.
   - Qué va en módulos transversales.
2. **Recortar sidebar por prioridad:**
   - Mantener visibles 6–8 items máximos.
   - Mover resto a grupo “Más módulos”.
3. **Redefinir bottom bar móvil a 4 destinos fijos:**
   - Inicio (`/dashboard`)
   - Agenda (`/calendar`)
   - Tareas (ej. `/assignments` o bandeja unificada)
   - Mi espacio (rol-aware: `/directory` o `/presidency/:org`)
   - Botón “Más” para sidebar completo.
4. **Unificar naming:**
   - “Dashboard” (global)
   - “Panel de organización” (contextual)
   - Evitar duplicados nominales que cambian de ruta según rol sin indicarlo.

## Fase 2 (mejora estructural)

1. **Separar shells de layout:**
   - `GlobalShell` para vistas transversales.
   - `OrganizationShell` para `/presidency/:org`.
2. **Introducir breadcrumb/contexto persistente** en header:
   - Ejemplo: `Dashboard > Organizaciones > Sociedad de Socorro`.
3. **Desacoplar “entidades” de “acciones”**:
   - Sidebar orientado a módulos.
   - CTA de acción (crear reunión, solicitar presupuesto) dentro del contexto.

## Fase 3 (optimización de interacción)

1. **Heurística de 3 toques en móvil:**
   - Tareas críticas deben resolverse en ≤3 interacciones desde inicio.
2. **Patrón maestro por página:**
   - Hero + KPI + lista prioritaria + CTA principal.
3. **Pruebas de usabilidad rápidas por rol** (obispado, presidencia, secretaría):
   - Encontrar una reunión.
   - Registrar una gestión.
   - Navegar a su módulo más usado.

---

## Criterios de calidad UX que deberías exigir

1. **Claridad de contexto:** el usuario sabe siempre si está en vista global o en su organización.
2. **Navegación sin duplicidad ambigua:** lo que aparece en bottom bar no replica de forma caótica el sidebar.
3. **Consistencia de etiquetas:** un mismo nombre implica un mismo tipo de contenido.
4. **Foco por rol:** cada perfil ve primero lo que más usa.
5. **Baja carga cognitiva móvil:** menos opciones simultáneas, más rutas predecibles.

---

## Respuesta directa a tu duda

> “¿La vista del panel de cada organización de presidencia tiene que ser su propio dashboard?”

Sí, pero como **dashboard de dominio** (operativo), no como reemplazo del dashboard principal. Piensa en dos niveles:

- **Dashboard principal:** panorama del barrio/rol.
- **Dashboard de presidencia:** ejecución diaria de una organización.

Con esta separación, limpias arquitectura, reduces duplicaciones de navegación y mejoras la sensación de orden en toda la app.
