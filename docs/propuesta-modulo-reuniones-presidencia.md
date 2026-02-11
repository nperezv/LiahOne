# Propuesta de diseño: módulo de Reuniones de Presidencia

## 1) Objetivo
Diseñar un flujo completo y sencillo para:
- Crear reuniones de presidencia con agenda.
- Generar automáticamente el informe/notas de la reunión desde esa agenda.
- Registrar asistencia de miembros con un gesto simple (tap/check).
- Reflejar métricas en el dashboard (gauge + barra de progreso).
- Añadir un bloque de próximos cumpleaños semanales.

La meta es que **crear reunión + gestionar asistencia + redactar informe** ocurra en una sola experiencia, sin duplicar información.

## 2) Propuesta de nombres (UI)

### Entrada dentro de Presidencia (recomendado)
- Ubicación: tarjeta/sección **Presidencia de Organización**.
- Acción principal: **“Gestionar Organización”**.
- Alternativas de etiqueta: “Reuniones y actas”, “Planificar reunión”.

### Submódulos
1. **Agenda de Presidencia** (crear y programar reuniones)
2. **Actas e Informes** (notas y acuerdos de cada reunión)
3. **Asistencia a Clases** (registro y analítica)

### Métricas del dashboard
- Gauge: **“Asistencia a Clases”**
- Tarjeta de reuniones: **“Reuniones de Presidencia (realizadas/planificadas)”**
- Barra inferior: **“Progreso mensual de reuniones”**

### Bloque de cumpleaños
- Tarjeta: **“Próximos cumpleaños”**
- CTA pequeño: **“Ver semana”**

## 3) Flujo funcional recomendado (end-to-end)

### Paso A. Crear reunión
En **Agenda de Presidencia** se completa:
- Fecha
- Hora
- Lugar (opcional)
- Quien ofrece oración
- Quien preside
- Quien dirige
- Puntos a tratar (lista ordenada)

Al guardar:
1. Se crea la entidad `meeting`.
2. Se crean los `agenda_items`.
3. Se crea automáticamente un borrador `meeting_report` vinculado.
4. Aparece un botón contextual: **“Redactar acta”**.

### Paso B. Redactar acta/informe
Al entrar en **Redactar acta**:
- Cabecera con datos de la reunión (fecha/hora/preside/dirige).
- Bloque inicial **prellenado** con “Puntos a tratar” importados de la agenda.
- Secciones sugeridas:
  1. Resumen de lo tratado
  2. Notas detalladas
  3. Asignaciones pendientes (dueño + fecha compromiso)
  4. Asignaciones completadas
  5. Verificaciones / seguimiento
  6. Puntos para la próxima reunión

> Regla clave: la agenda alimenta automáticamente el acta para evitar doble captura.

### Paso C. Registrar asistencia
Dentro de la misma vista de reunión (tab “Asistencia”):
- Lista de **todos los miembros de la organización**.
- Interacción tipo “tap sobre nombre” para marcar asistencia.
- Búsqueda por nombre + filtros rápidos (todos, presentes, ausentes).
- Botón **Guardar asistencia**.

Al guardar:
- Se calcula `presentes / total`.
- Se guarda porcentaje por reunión.
- Se actualiza el gauge del dashboard para el período activo (semana/mes).

## 4) Diseño de dashboard (ajustes que pediste)

### 4.1 Tarjeta de Reuniones de Presidencia
- Mantener contador textual actual (ej. `0 / 4`).
- Añadir debajo una barra horizontal de progreso con la misma paleta actual.
- Tooltip recomendado: “Reuniones realizadas este mes vs plan mensual”.

### 4.2 Gauge de asistencia
- Renombrar a **“Asistencia a Clases”**.
- Fuente de datos: promedio de asistencia de reuniones/clases del período.
- Mostrar:
  - % asistencia (valor principal)
  - asistentes promedio (ej. `18/24`)

### 4.3 Cumpleaños de la semana
Ubicación sugerida: debajo de “Presupuesto de organización”.
Contenido mínimo:
- Mostrar 1 nombre prioritario (el de hoy si existe; si no, el más próximo).
- Texto de apoyo: “+N en los próximos 7 días”.
- Botón pequeño **“Ver semana”** que abre modal con lista completa.

Modal:
- Agrupar por “Hoy”, “Próximos 7 días”.
- Mostrar nombre + edad que cumple (si está disponible).

## 5) Modelo de datos sugerido

> Nombres orientativos para mantener consistencia con tablas ya existentes.

1. `presidency_meetings`
   - `id`, `organization_id`, `date`, `start_time`, `location`, `preside_by_member_id`, `conduct_by_member_id`, `opening_prayer_member_id`, `status`

2. `presidency_meeting_agenda_items`
   - `id`, `meeting_id`, `sort_order`, `topic`, `notes`

3. `presidency_meeting_reports`
   - `id`, `meeting_id`, `summary`, `detailed_notes`, `next_meeting_topics`, `verification_notes`, `is_final`

4. `presidency_meeting_assignments`
   - `id`, `meeting_id`, `title`, `owner_member_id`, `due_date`, `status` (`pending|done`), `completion_note`

5. `presidency_meeting_attendance`
   - `id`, `meeting_id`, `member_id`, `present`, `checked_at`

6. (opcional) vista/materializada para métricas
   - `% asistencia mensual`, `reuniones realizadas`, `reuniones planificadas`

## 6) Reglas de negocio clave
1. Al crear reunión, crear siempre borrador de acta.
2. Los puntos de agenda se copian al acta al crear el borrador.
3. Si se edita agenda después, mostrar opción “Sincronizar puntos al acta” (manual para no pisar texto ya redactado).
4. La asistencia se congela al cerrar reunión (o se deja editable con auditoría).
5. Dashboard lee datos agregados, no cálculos en cliente por rendimiento.

## 7) UX recomendada (simple y rápida)

### Vista de detalle de reunión con pestañas
- **Agenda**
- **Acta**
- **Asistencia**

Así se evita navegar entre pantallas separadas y el usuario siente que todo pertenece a la misma reunión.

### Botones/CTA sugeridos
- Crear reunión
- Redactar acta
- Guardar asistencia
- Cerrar reunión
- Exportar informe (fase 2)

## 8) Plan de implementación por fases

### Fase 1 — MVP (alto impacto)
- Crear reunión con agenda.
- Autocreación de borrador de acta.
- Registro de asistencia con check por miembro.
- Gauge “Asistencia a Clases” con cálculo básico mensual.
- Barra de progreso bajo “Reuniones de Presidencia”.

### Fase 2 — Consolidación
- Secciones completas del acta (pendientes/hechas/verificaciones/siguiente reunión).
- Cumpleaños de la semana + modal “Ver semana”.
- Filtros y búsqueda mejorados en asistencia.

### Fase 3 — Analítica y gobierno
- Tendencia histórica de asistencia (últimos 6 meses).
- Recordatorios automáticos de asignaciones pendientes.
- Exportación PDF del informe de reunión.

## 9) KPIs para validar que funciona
- % reuniones con acta creada el mismo día.
- % reuniones con asistencia registrada.
- Tiempo medio para cerrar una reunión (crear → acta final).
- Evolución de “Asistencia a Clases”.

## 10) Validación de tu flujo (respuesta directa)
Sí: tu flujo es **correcto y muy sólido**. La mejor implementación es un módulo unificado de reunión con tres pestañas (Agenda/Acta/Asistencia), autogeneración del acta al crear la reunión, y un dashboard que refleje esa operación con gauge + barra de progreso + cumpleaños semanales.

Si te parece bien, el siguiente paso sería convertir esta propuesta en:
1. historias de usuario,
2. diseño de pantallas (wireframes),
3. y tickets técnicos (DB + API + UI) para empezar el desarrollo iterativo.

## 11) Acceso revisado (dentro de Presidencia de Organización, sin FAB)

Perfecto: para mantener coherencia con tu visión (iOS style, moderno, amigable), **no** recomiendo crear un módulo separado en menú ni usar FAB.

La entrada debe vivir **dentro del propio apartado de Presidencia de Organización**.

### A. Ubicación exacta
En el header del bloque **Presidencia de [Nombre de organización]**:
- Mantener el título principal.
- A la derecha del título, agregar un icono discreto tipo `calendar.badge.plus` / `doc.text`.
- Debajo del título (subheader), colocar un botón primario compacto.

### B. Nombre recomendado del botón
Orden de recomendación:
1. **Gestionar Organización** (más alineado con la sección)
2. **Reuniones y actas**
3. **Planificar reunión** (si quieres enfatizar agenda)

Mi recomendación final: **Gestionar Organización**.

### C. Patrón visual iOS-friendly (sin FAB)
- Botón en estilo “pill” o “filled tonal”, integrado en la tarjeta (no flotante).
- Icono + texto corto.
- Jerarquía:
  - Acción principal: `Gestionar Organización`
  - Acción secundaria (si hay borrador): `Redactar acta`
- Evitar botones flotantes para no romper la limpieza visual.

### D. Flujo de acceso final
1. Entrar a **Presidencia de Organización**.
2. Tap en **Gestionar Organización**.
3. Abrir vista interna con tabs:
   - **Agenda**
   - **Acta**
   - **Asistencia**
4. Desde ahí: crear reunión, redactar acta y guardar asistencia.

### E. ¿Icono al lado del nombre de la presidencia?
Sí, encaja muy bien con tu idea.
- Si quieres interfaz minimalista: dejar solo icono y tooltip.
- Si quieres mayor claridad (recomendado): icono + botón `Gestionar Organización` debajo del header de Presidencia.

## 12) Navegación y botón “Volver” (revisión solicitada)

Sí, **todas las secciones que abren otra vista deberían tener un botón de volver** para regresar al estado anterior.

### Reglas recomendadas
1. En mobile iOS-style: back arrow arriba izquierda + título corto de la pantalla.
2. Si se entra desde dashboard/presidencia, `Volver` debe regresar al mismo contexto (misma organización y scroll si es posible).
3. Si hay cambios sin guardar (acta/asistencia), mostrar confirmación antes de salir.
4. En tabs internas (Agenda/Acta/Asistencia) no usar “volver” entre tabs; el back sale de la vista completa de reuniones.

### Microcopy recomendado
- `Volver`
- `Cancelar`
- `Guardar y volver`
- `Salir sin guardar`

Con esta revisión, la experiencia queda alineada con tu idea: acceso contextual dentro de Presidencia, sin FAB, con estética moderna y una navegación clara de ida/vuelta.


## 13) ¿Qué hace exactamente el nuevo apartado?

El nuevo apartado (accesible con `Gestionar Organización` dentro de Presidencia) concentra 4 funciones:
1. **Programar reuniones dominicales** de cada mes (agenda, responsables y temas).
2. **Registrar asistencia semanal** de miembros por cada domingo.
3. **Generar y cerrar acta/informe** de cada reunión con seguimiento.
4. **Publicar métricas** para dashboard (gauge) y para Secretaría (histórico semanal/mensual/anual).

En resumen: no es solo “crear reuniones”; es el centro operativo para planificar, pasar lista, documentar y medir.

## 14) Registro de asistencia (domingo a domingo) — diseño funcional

Sí, te entiendo perfectamente: la asistencia debe guardarse por **cada domingo del mes**, y mantenerse histórica para todo el año.

### A. Unidad de registro
- Cada reunión dominical (ej. domingo 1, 2, 3, 4, 5 del mes) genera un registro independiente.
- En cada registro se guarda:
  - fecha exacta del domingo,
  - lista de miembros de la organización,
  - estado por miembro (`presente` / `ausente`),
  - conteo total (`presentes`, `total`, `% asistencia`).

### B. Flujo operativo semanal
1. Entrar a `Gestionar Organización`.
2. Seleccionar domingo (o abrir “Reunión de este domingo”).
3. En tab **Asistencia**, marcar por tap/check los miembros presentes.
4. Guardar.
5. El sistema calcula porcentaje y actualiza métricas.

### C. Cálculo para el gauge
- El gauge de **Asistencia a Clases** debe consumir agregados por período.
- Recomendación por defecto:
  - **Vista mensual**: promedio de los domingos del mes actual.
  - **Vista anual**: promedio de todos los domingos registrados del año.
- Fórmula mensual sugerida:
  - `asistencia_mes = sum(presentes_domingo) / sum(total_domingo)`.

### D. Integración con Secretaría
Debe existir una salida directa al apartado de Secretaría con tabla histórica:
- columnas mínimas: `Semana/Domingo`, `Presentes`, `Total`, `%`, `Observaciones`.
- filtros: mes, año, organización.
- resumen del mes: promedio mensual + mejor/peor domingo.

Así Secretaría puede revisar semanalmente y consolidar el histórico de todo el año sin duplicar captura.

### E. Estructura de datos recomendada (ajuste específico)
Sobre la tabla `presidency_meeting_attendance`, incluir/validar:
- `meeting_id`
- `member_id`
- `attendance_date` (domingo específico)
- `present` (boolean)
- `recorded_by`
- `recorded_at`

Y una vista agregada para reportes de Secretaría:
- `vw_weekly_attendance_summary` (por domingo/mes/año/organización).

### F. Reglas clave de consistencia
1. Solo una asistencia por miembro por domingo y organización.
2. Si se edita después del cierre, guardar auditoría (quién/fecha/cambio).
3. Si no existe reunión creada para un domingo, permitir “registro rápido” y autogenerar reunión base.
4. Dashboard y Secretaría leen del mismo origen agregado para evitar diferencias.

Con este enfoque, tienes exactamente lo que pides: control semanal por cada domingo, consolidación mensual/anual, gauge actualizado y trazabilidad completa para Secretaría.
