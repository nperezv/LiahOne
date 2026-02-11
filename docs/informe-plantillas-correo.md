# Informe de revisión de plantillas de correo

Fecha: 2026-02-11  
Alcance: plantillas implementadas en `server/auth.ts` y su uso en `server/routes.ts`.

## Criterio de referencia
Se tomó como **plantilla modelo** la confirmación de entrevista programada (`sendInterviewScheduledEmail`), porque ya contempla:

- Saludo según franja horaria.
- Tratamiento por sexo (hermana/hermano), con fallback por tipo de organización.
- Estructura clara del mensaje (contexto, fecha/hora/lugar, cierre y firma).

Además, para normalización de nombre se usa la lógica de `normalizeMemberName` en rutas de entrevistas y reuniones sacramentales para convertir nombres desde formato “Apellidos Nombres” hacia “Nombres Apellidos” cuando aplica.

---

## Resumen ejecutivo

- Total de plantillas revisadas: **8**.
- Plantillas **alineadas o parcialmente alineadas** con la lógica objetivo: **2**.
- Plantillas **no alineadas** (sin sexo y/o sin normalización de nombre): **6**.
- Problema principal: inconsistencia de estilo y de tratamiento nominal entre tipos de correo.

---

## Revisión por plantilla

## 1) `sendInterviewScheduledEmail` (Entrevista programada)
**Estado:** ✅ Referencia correcta (base actual).

**Cumple:**
- Saludo por hora (`getTimeGreeting`).
- Tratamiento por sexo/organización (`getRecipientSalutation`).
- Formato homogéneo y respetuoso.
- Firma contextual de obispado.

**Observaciones:**
- El nombre del receptor llega ya normalizado para miembros en alta de entrevista (`memberName = normalizeMemberName(...)`), pero para `assignedUser` se envía `assignedUser.name` sin normalizar explícita en ese punto.

**Riesgo residual:** Bajo.

---

## 2) `sendInterviewUpdatedEmail` (Actualización de entrevista)
**Estado:** ⚠️ Parcialmente alineada.

**Cumple:**
- Estructura clara y profesional.
- Uso de viñetas para cambios.

**No cumple respecto al modelo:**
- No utiliza saludo por hora.
- No utiliza lógica por sexo; usa “Querido(a) hermano(a)”.
- No recibe sexo/organización para ajustar tratamiento.

**Riesgo:** Medio (inconsistencia de estilo y lenguaje).

---

## 3) `sendInterviewCancelledEmail` (Cancelación de entrevista)
**Estado:** ⚠️ Parcialmente alineada.

**Cumple:**
- Tono y estructura adecuados.

**No cumple respecto al modelo:**
- No usa saludo por hora.
- No usa sexo/organización; usa “Querido(a) hermano(a)”.

**Riesgo:** Medio.

---

## 4) `sendSacramentalAssignmentEmail` (Asignaciones sacramentales)
**Estado:** ⚠️ Parcialmente alineada.

**Cumple:**
- Estructura clara y fecha/hora.
- En ruta, el nombre sí se normaliza (`recipientName = normalizeMemberName(...)`).

**No cumple respecto al modelo:**
- No usa saludo por hora.
- No usa sexo/organización; usa “Querido(a) hermano(a)”.

**Riesgo:** Medio.

---

## 5) `sendBirthdayGreetingEmail` (Cumpleaños)
**Estado:** ❌ No alineada.

**Cumple:**
- Mensaje funcional simple.

**No cumple respecto al modelo:**
- Saludo genérico “Hola ...”.
- No contempla sexo/organización.
- Nombre se toma directo de `birthday.name` sin normalización adicional.

**Riesgo:** Medio-alto (nombres potencialmente invertidos y formato inconsistente).

---

## 6) `sendNewUserCredentialsEmail` (Credenciales de nueva cuenta)
**Estado:** ❌ No alineada.

**Cumple:**
- Información crítica completa.

**No cumple respecto al modelo:**
- No usa saludo por hora.
- No contempla sexo/organización.
- Nombre se consume directo (`payload.name`) sin normalización.

**Riesgo:** Medio.

---

## 7) `sendAccessRequestEmail` (Solicitud de acceso)
**Estado:** ❌ No alineada (correo administrativo, sin personalización).

**Cumple:**
- Estructura tipo notificación administrativa.

**No cumple respecto al modelo:**
- No aplica tratamiento por sexo.
- No normaliza nombre del solicitante (`requesterName`) antes de insertar en texto.

**Riesgo:** Bajo-medio (afecta presentación, no funcionalidad).

---

## 8) `sendLoginOtpEmail` (Código OTP)
**Estado:** ℹ️ Fuera de patrón pastoral (transaccional mínimo).

**Cumple:**
- Correcto para un correo de seguridad transaccional.

**No cumple respecto al modelo:**
- No usa nombre, sexo ni formato extenso.

**Riesgo:** Bajo (esperable por tipo de correo).

---

## Hallazgos transversales

1. **Lógica de sexo centralizada pero subutilizada:**
   `getRecipientSalutation` existe, pero se usa básicamente en entrevista programada.

2. **Normalización de nombre implementada pero no universal:**
   `normalizeMemberName` existe en rutas y se usa en varios flujos, pero no en todos los payloads de correo.

3. **Inconsistencia de tono/estilo:**
   coexistencia de “Buenos días + apreciado hermano/hermana” vs “Querido(a) hermano(a)” vs “Hola”.

---

## Recomendaciones priorizadas

### Prioridad alta
1. Crear un **builder unificado de saludo** para todas las plantillas pastorales:
   - Entrada: `recipientName`, `recipientSex`, `recipientOrganizationType`, `timeLabel`.
   - Salida: cabecera homogénea (`Buenos días apreciada hermana Nombre Apellido,`).

2. Garantizar que todas las plantillas que mencionan persona usen nombre normalizado:
   - Aplicar `normalizeMemberName(...)` al construir payloads en rutas para cualquier `name` de directorio.

### Prioridad media
3. Separar formalmente correos **pastorales** vs **transaccionales**:
   - Pastorales: entrevista, asignaciones, cumpleaños.
   - Transaccionales: OTP, alertas administrativas.

4. Homologar cierres y firmas por tipo de correo:
   - Misma convención de cierre (“Con aprecio y gratitud”).

### Prioridad baja
5. Añadir pruebas unitarias para:
   - sexo masculino/femenino/desconocido,
   - normalización de nombres en formato “Apellidos Nombres”,
   - contenido mínimo por plantilla.

---

## Conclusión
Hoy la app ya tiene una base correcta en la confirmación de entrevista programada, incluyendo sexo y estructura de mensaje. Sin embargo, **la mayoría de plantillas aún no heredan esa misma lógica**, especialmente en saludo por sexo y normalización homogénea de nombres. La deuda principal es de consistencia de presentación, más que de envío técnico.
