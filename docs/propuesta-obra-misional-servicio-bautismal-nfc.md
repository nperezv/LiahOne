# Propuesta funcional: obra misional + servicios bautismales con URL pública NFC

## 1) Objetivo
Diseñar un módulo integral para que el equipo misional pueda:

1. Gestionar amigos que progresan espiritualmente.
2. Programar servicios bautismales.
3. Preparar agenda y asignaciones internas.
4. Publicar un único enlace público (compatible con etiqueta NFC) para que los asistentes vean el programa del servicio.
5. Enviar notificaciones automáticas por correo (usuarios y no usuarios) y push (usuarios).
6. Conservar un historial/reminiscencia del servicio (mensajes y recuerdos).

---

## 2) Propuesta de URL pública (NFC)

### URL maestra sugerida
- `https://tu-dominio.org/bautismo/{slug}`

### Ejemplos
- `https://tu-dominio.org/bautismo/familia-garcia-2026-03-15`
- `https://tu-dominio.org/bautismo/san-jose-ward-2026-04-11`

### Recomendación técnica
- Usar un `slug` amigable para impresión y NFC.
- Mantener un `token interno` (UUID) para seguridad y administración, desacoplado del slug público.
- Permitir que el slug redireccione a la versión activa del servicio si hay cambios de fecha/hora.

---

## 3) Roles y permisos

### 3.1 Roles nuevos
1. **Líder misional**
   - Administra agenda bautismal.
   - Crea y asigna responsabilidades.
   - Supervisa checklist de senda de convenios.
   - Publica/activa enlace público.

2. **Misionero de tiempo completo**
   - Acceso exclusivo a módulos de obra misional.
   - Registra progreso de amigos, lecciones, metas y fechas.
   - Puede sugerir asignaciones y ver checklist.

3. **Misionero del barrio**
   - Acceso exclusivo a módulos de obra misional.
   - Apoya seguimiento, registro de contactos y tareas asignadas.

### 3.2 Alcance de acceso
- Estos roles deben ver únicamente:
  - Panel de obra misional.
  - Amigos en progreso.
  - Servicios bautismales.
  - Agenda y asignaciones relacionadas.
- No deben visualizar módulos administrativos no misionales (finanzas, inventario, etc.).

---

## 4) Módulo “Obra misional”

### 4.1 Ficha de amigo en progreso (CRM misional)
Campos sugeridos:
- Nombre completo.
- Edad.
- Fecha de nacimiento.
- Teléfono.
- Correo electrónico.
- Barrio/área.
- Misioneros asignados.
- Estado de progreso (nuevo, en enseñanza, con fecha bautismal, bautizado, pausado).

### 4.2 Seguimiento espiritual
- Lecciones de “Predicad Mi Evangelio” (checklist por lección).
- Indicadores clave:
  - ¿Ora?
  - ¿Lee escrituras?
  - ¿Asiste a la iglesia?
  - ¿Guarda compromisos?
- Fecha bautismal objetivo.
- Entrevista bautismal completada (sí/no + fecha).
- Conoció al obispo (sí/no + fecha).
- Notas pastorales y observaciones.

### 4.3 Checklist de senda de convenios
Modelo de checklist configurable por estacas/barrios:
- Lección 1 completada.
- Lección 2 completada.
- Lección 3 completada.
- Lección 4 completada.
- Entrevista bautismal realizada.
- Reunión con obispo realizada.
- Agenda bautismal confirmada.
- Confirmación post-bautismal planificada.

---

## 5) Flujo de servicio bautismal

1. **Crear servicio**
   - Fecha/hora/lugar.
   - Persona candidata y misioneros responsables.

2. **Preparar agenda** (rol Líder misional)
   - Oración inicial.
   - Himno.
   - Número especial.
   - Primer mensaje.
   - Segundo mensaje.
   - Ordenanza bautismal.
   - Confirmación (si aplica por programación).
   - Oración final.

3. **Asignaciones logísticas**
   - Refrigerio.
   - Limpieza de capilla.
   - Recogida/gestión de ropa bautismal.
   - Recepción y bienvenida.

4. **Publicación del enlace**
   - Activar URL pública para NFC.
   - Mostrar solo información pública permitida.

5. **Modo recuerdo (post-evento)**
   - Mantener página pública como memoria.
   - Habilitar muro de mensajes, buenos deseos, testimonios breves.
   - Subida opcional de fotos (con moderación/aprobación).

---

## 6) Interacción pública (URL NFC)

### 6.1 Lo que ve el público
- Programa del servicio (en tiempo real).
- Participantes y asignaciones visibles.
- Estado del servicio (programado, en curso, finalizado).

### 6.2 Interacciones sugeridas
- Botón “Enviar buenos deseos” (formulario breve).
- Botón “Enviar correo” (mailto al contacto designado).
- Botón “Enviar WhatsApp” (link wa.me preconfigurado).
- Carga de foto o mensaje de recuerdo (opcional y moderado).

### 6.3 Privacidad
- No exponer teléfonos/correos privados sin consentimiento.
- Moderar contenido público antes de publicar.
- Separar datos internos del equipo misional y datos visibles al público.

---

## 7) Notificaciones y alertas

### 7.1 Regla general
- **Usuarios registrados:** correo + push.
- **No usuarios:** solo correo.

### 7.2 Eventos que disparan notificación
- Nueva asignación creada.
- Cambio de asignación.
- Recordatorio 7 días antes del bautismo.
- Recordatorio 48 horas antes.
- Alerta 24 horas antes si falta:
  - entrevista bautismal,
  - reunión con obispo,
  - agenda incompleta.
- Confirmación de publicación del enlace NFC.

### 7.3 Resumen diario opcional
- Digest diario para líder misional con pendientes críticos.

---

## 8) Modelo de datos mínimo (MVP)
Tablas/colecciones sugeridas:
- `mission_contacts` (amigos en progreso).
- `mission_progress_checkpoints`.
- `baptism_services`.
- `baptism_program_items`.
- `baptism_assignments`.
- `baptism_public_pages`.
- `baptism_public_messages`.
- `notification_jobs`.
- `notification_deliveries`.

---

## 9) Roadmap recomendado

### Fase 1 (rápida, 2–4 semanas)
- Roles y permisos base.
- CRUD de amigos en progreso.
- Checklist espiritual básico.
- Programación de servicio y agenda interna.
- URL pública de solo lectura.

### Fase 2 (4–8 semanas)
- Notificaciones inteligentes (correo/push).
- Asignaciones logísticas completas.
- Formularios públicos de mensajes y buenos deseos.
- Moderación de contenido.

### Fase 3 (8–12 semanas)
- Analítica de progreso misional.
- Plantillas avanzadas de agenda por barrio.
- Historial enriquecido de servicios (fotos, testimonios, reporte).
- Integración robusta NFC (multi-evento, expiración, reactivación).

---

## 10) Recomendaciones de implementación
1. Empezar con MVP centrado en: roles + checklist + agenda + URL pública.
2. Diseñar desde el inicio separación entre:
   - datos sensibles internos,
   - datos públicos del enlace NFC.
3. Agregar motor de recordatorios por reglas (cron + cola de trabajos).
4. Dejar “modo recuerdo” como feature bandera para fortalecer participación y retención.
5. Definir políticamente quién aprueba mensajes/fotos para evitar contenido inapropiado.

---

## 11) Definición de éxito
- 100% de servicios bautismales con agenda digital publicada por URL única.
- Reducción de asignaciones olvidadas gracias a notificaciones.
- Mayor preparación previa (entrevista, obispo, agenda completa).
- Registro histórico útil para liderazgo y memoria espiritual de la comunidad.
