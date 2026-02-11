# LiahonaOS Style: plan estratégico global (desktop + mobile/tablet)

## 1) Objetivo global

Definir y aplicar un **sistema visual y de interacción unificado** para toda la aplicación, separando explícitamente la experiencia en:

- **Desktop (>= 1024px):** productividad, densidad moderada, navegación persistente lateral.
- **Tablet (768px–1023px):** foco en contenido con navegación híbrida (top + bottom / sheet contextual).
- **Mobile (< 768px):** flujo vertical, módulos clave en carrusel horizontal, navegación inferior iOS-style.

El objetivo no es solo “embellecer” Presidencias, sino llevar un patrón estable para todas las áreas: Dashboard, Calendario, Directorio, Presupuesto, Entrevistas, Metas, Reportes, Configuración y módulos administrativos.

---

## 2) Lectura actual de la app (estado base)

### Hallazgos globales

1. Ya existe una base de diseño con variables HSL, dark mode y elevación en `index.css`, pero la aplicación todavía mezcla estilos de forma inconsistente entre páginas.
2. La arquitectura actual comparte una sola `Layout` para todas las rutas protegidas y decide móvil con `useIsMobile`; eso es útil, pero insuficiente para separar de forma limpia patrones desktop/mobile.
3. Existe navegación móvil (`MobileNav`) y sidebar desktop, pero no hay un **design contract** de layout por tipo de pantalla para cada módulo.
4. No existe todavía un set consolidado de componentes “LiahonaOS premium” (gauge circular, cards glass, listas swipeables, resource grid + sheet) reutilizable en toda la app.

### Riesgos del estado actual

- Fragmentación visual (“frankenstein”).
- Variación de spacing/radios/sombras entre pantallas.
- UX móvil reactiva (adaptada) en vez de UX móvil nativa (diseñada).
- Mayor costo de mantenimiento por estilos repetidos por página.

---

## 3) Propuesta de diseño unificado: “LiahonaOS Design System”

## 3.1 Fundaciones (tokens)

Crear una capa explícita de tokens semánticos (sin romper los tokens actuales):

- **Color tokens:** `surface.base`, `surface.elevated`, `surface.glass`, `text.primary`, `text.secondary`, `accent.blue`, `accent.teal`, `accent.gold`, `status.success/warn/error`.
- **Radius tokens:** `radius.card = 24px`, `radius.control = 14px`, `radius.pill = 999px`.
- **Spacing scale:** 4/8/12/16/24/32.
- **Shadow tokens:** `shadow.soft`, `shadow.float`, `shadow.glass`.
- **Motion tokens:** spring presets (`gentle`, `snappy`) y duraciones (`120ms`, `220ms`, `420ms`).

## 3.2 Tipografía y ritmo

- Jerarquía limpia: títulos cortos, subtítulos descriptivos, KPIs muy legibles.
- Limitar longitudes de línea y ruido textual.
- Uniformar densidad vertical por breakpoint.

## 3.3 Superficies / componentes base

1. **Card LiahonaOS (`rounded-2xl`, glass opcional, sombra suave).**
2. **Gauge circular premium** (arco grueso, gradiente, animación de entrada, centro tipográfico).
3. **Segmented progress bars** para presupuesto y metas secundarias.
4. **Listas enriquecidas** (avatar + nombre + rol + acciones).
5. **Bottom sheet universal** para acciones y detalles contextuales (mobile/tablet).
6. **Carruseles horizontales** para bloques de alto valor en móvil.

---

## 4) Separación real de Desktop vs Mobile/Tablet

## 4.1 Contrato de layout por dispositivo

Definir 3 shells explícitos:

- `DesktopShell`
- `TabletShell`
- `MobileShell`

Y que cada página renderice composición distinta por shell, no sólo cambios de clases.

## 4.2 Reglas por plataforma

### Desktop
- Sidebar persistente + header informativo.
- Grillas de 12 columnas, tarjetas de densidad media.
- Paneles simultáneos (por ejemplo KPI + listado + detalle).

### Tablet
- Prioridad a 2 columnas adaptativas.
- Interacciones contextuales con sheets laterales/inferiores.
- Menos densidad que desktop, más foco que mobile.

### Mobile
- Scroll vertical con secciones “hero → quick actions → detalle”.
- Gauges grandes arriba.
- Bloques horizontales (resources, reuniones, atajos).
- Directorio y transacciones con patrones táctiles (tap + swipe).

---

## 5) Aplicación por módulo (toda la app)

## 5.1 Dashboard
- Hero KPI (1–2 gauges principales).
- Quick stats cards compactas.
- Agenda próxima + accesos rápidos.
- Móvil: primero indicadores, luego listas.

## 5.2 Presidencias / Liderazgo / Reuniones
- El mockup que compartiste se vuelve plantilla maestra.
- Gauge de metas + gauge de presupuesto + directorio + recursos.
- Desktop: bloques paralelos; mobile: secuencia narrativa vertical.

## 5.3 Presupuesto
- Gauge de uso + barra segmentada por categorías.
- Lista de movimientos con filtros rápidos y estados.
- Modal/sheet para ver detalle de transacción.

## 5.4 Directorio
- Búsqueda persistente + filtros.
- Item de persona con avatar/rol/contacto.
- Mobile: swipe actions (llamar, mensaje, asignar).

## 5.5 Metas, Actividades, Calendario
- Metas: cards por objetivo + progreso animado.
- Actividades/Calendario: vista cronológica limpia + CTA contextual.
- Mobile: timeline vertical y acciones en bottom sheet.

## 5.6 Entrevistas, Sacramental, Consejo de barrio
- Estandarizar plantilla de “panel + lista + detalle”.
- Reutilizar componentes de estado, badge y checklist.
- Mantener consistencia visual y de navegación por rol.

## 5.7 Reportes / Configuración / Admin
- Menos “card overload”, más claridad funcional.
- Jerarquía tipográfica sobria, foco en tareas administrativas.
- Mantener lenguaje visual premium aunque sea zona utilitaria.

---

## 6) Plan de ejecución por fases

## Fase 0 — Auditoría y baseline (2–3 días)
- Inventario por pantalla (qué componentes usa y qué breakpoints rompe).
- Capturas de estado actual (desktop/tablet/mobile).
- Definir métricas: consistencia, tiempo de tarea, rebote en mobile.

## Fase 1 — Fundaciones (3–5 días)
- Formalizar tokens y utilidades LiahonaOS.
- Crear primitives reutilizables (`LiahonaCard`, `LiahonaGauge`, `SegmentBar`, `BottomSheet`, `DirectoryItem`).
- Integrar Framer Motion con presets globales.

## Fase 2 — Shell responsive real (3–4 días)
- Extraer `DesktopShell/TabletShell/MobileShell`.
- Alinear navegación y contenedores por dispositivo.
- Mantener compatibilidad con rutas actuales.

## Fase 3 — Módulos prioritarios (1–2 semanas)
- Orden recomendado: Dashboard → Presidencias/Liderazgo → Presupuesto → Directorio → Calendario/Metas.
- QA funcional + visual por cada módulo.

## Fase 4 — Módulos secundarios y hardening (1 semana)
- Entrevistas, reportes, settings, admin.
- Ajustes de rendimiento (animaciones y listas grandes).
- Accesibilidad y modo oscuro final.

## Fase 5 — Cierre y governance
- Documentar patrón por componente.
- Checklist de PR visual obligatorio.
- Evitar regresiones con validación por breakpoint.

---

## 7) Criterios de aceptación

1. Cada pantalla crítica existe en versión desktop/tablet/mobile con layout intencional.
2. Los componentes visuales premium son compartidos, no duplicados por página.
3. Modo oscuro consistente en todos los módulos.
4. Animaciones fluidas, sin afectar rendimiento.
5. Navegación móvil clara y táctil.

---

## 8) Qué cambiaría de tu prompt para hacerlo global y ejecutable

Tu prompt está muy bien para Presidencias. Para toda la app, le añadiría:

1. **Scope explícito:** “apply this design system across every route in the app”.
2. **Responsive contract:** definir shells desktop/tablet/mobile obligatorios.
3. **Component parity:** los mismos componentes base deben reutilizarse en todos los módulos.
4. **QA rules:** checklist de contraste, spacing, motion y dark mode por pantalla.
5. **Performance guardrails:** límites para animaciones/listas en móviles medios.

Propuesta de añadido breve al prompt:

> “Implement a cross-app LiahonaOS design system with dedicated desktop/tablet/mobile shells, shared premium components, and consistent behavior across all routes (dashboard, presidency, budget, directory, meetings, interviews, reports, settings, admin). Ensure dark mode parity, accessibility, and performance budgets for animations.”

---

## 9) Entregables que te propondría para aprobación

1. **UI blueprint global** (mapa de layouts por módulo y por dispositivo).
2. **Librería de componentes LiahonaOS** (con ejemplos de uso).
3. **1 módulo piloto completo** (Presidencias o Dashboard) en desktop+mobile.
4. **Plan de migración por lotes** para el resto de la app.
5. **Checklist de calidad visual** para que nunca vuelva el efecto “frankenstein”.

Con eso puedes aprobar primero la dirección visual y luego ejecutar por fases, con riesgo controlado y resultado consistente.

---

## 10) Decisiones aprobadas (bloque de ejecución)

Estas decisiones quedan cerradas para iniciar implementación:

1. **Piloto inicial:** Presidencias (`/presidency/:org`).
2. **Segundo módulo:** Dashboard (`/dashboard`).
3. **Nivel de animación:** suave premium (spring sutil, sin exceso).
4. **Tablet UX:** comportamiento cercano a mobile (flujo vertical, foco en tareas, uso de sheets).

### Orden práctico de entrega

1. **Presidencias completo**
   - Desktop: layout maestro con gauges + presupuesto + directorio + recursos.
   - Mobile: narrativa vertical (hero → quick stats → detalle).
   - Tablet: variante “mobile-first” con bloques adaptativos y bottom sheets.

2. **Dashboard completo**
   - Reutilizando los mismos primitives y motion presets.
   - Manteniendo consistencia de spacing, jerarquía y dark mode.

### Criterio de validación por cada entrega

- Confirmación visual en desktop + tablet + mobile.
- Confirmación de animaciones suaves (sin jitter ni sobrecarga).
- Confirmación de compatibilidad con dark mode.
- Confirmación de navegación y legibilidad táctil en tablet/mobile.
