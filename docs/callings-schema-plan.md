# Plan de llamamientos y acceso (unificación en members)

Este documento define un esquema propuesto para **llamamientos** (roles en organizaciones) y su relación con **miembros** y **usuarios**. El objetivo es que:

- `members` sea la **fuente única de personas**.
- `users` contenga **credenciales y permisos de acceso**.
- Los **llamamientos** se modelen como asignaciones de un miembro a una organización, incluso si no tiene cuenta.

## 1) Principios

1) **Una persona = un miembro** (`members`).
2) **Una cuenta = un usuario** (`users`) vinculado opcionalmente a un miembro.
3) **Un llamamiento = una asignación** (`member_callings`).
4) Los llamamientos existen **aunque no haya cuenta**.
5) El directorio muestra a todos los miembros y sus llamamientos.

## 2) Tablas involucradas

### 2.1 `members` (existente)
Contiene los datos personales: nombre, sexo (F/M), cumpleaños, contacto y organización principal.

### 2.2 `users` (existente)
Contiene credenciales y **permisos de acceso**. Se recomienda que el usuario esté vinculado a un miembro con `memberId`.

### 2.3 `member_callings` (nueva)
Tabla propuesta para almacenar **llamamientos**.

Campos recomendados:

- `id` (uuid)
- `memberId` (FK a `members`)
- `organizationId` (FK a `organizations`)
- `callingName` (texto)
- `callingType` (opcional: enum para agrupar)
- `isActive` (boolean)
- `startDate` (opcional)
- `endDate` (opcional)
- `createdAt`

## 3) Ejemplos de llamamientos (según tu lista)

### 🏛️ Obispado
- Obispo
- Primer consejero del obispo
- Segundo consejero del obispo
- Secretario ejecutivo
- Secretario del barrio
- Secretario financiero

### 👨‍🦳 Cuórum de Élderes
- Presidente del cuórum de élderes
- Primer consejero
- Segundo consejero
- Secretario del cuórum
- Maestro del cuórum
- Líderes de ministración (supervisores)

### 👩 Sociedad de Socorro
- Presidenta
- Primera consejera
- Segunda consejera
- Secretaria
- Maestras
- Coordinadoras de ministración

### 👧 Mujeres Jóvenes
- Presidenta de Mujeres Jóvenes
- Consejeras
- Secretaria
- Asesoras de clases
- Especialistas de Mujeres Jóvenes

### 👦 Hombres Jóvenes
- Obispado (presidencia del sacerdocio Aarónico)
- Asesores de Hombres Jóvenes
- Especialistas de Hombres Jóvenes
- Presidencias de quórum (diáconos, maestros, presbíteros)

### 🧒 Primaria
- Presidenta de la Primaria
- Consejeras
- Secretaria
- Líderes de música
- Pianista
- Maestros de clases
- Líderes de guardería (Nursery)

### 🏠 Escuela Dominical
- Presidente de Escuela Dominical
- Consejeros
- Secretaria
- Maestros de clases de adultos y jóvenes

### 🎵 Música
- Director(a) de música del barrio
- Pianista/organista
- Director de coro
- Pianista de coro

### 🧾 Historia Familiar y Templo
- Consultor(es) de historia familiar y templo
- Líder de templo e historia familiar del barrio

### 📌 Misional
- Líder misional del barrio
- Misioneros de Barrio
- Maestros de preparación misional

### 🛠️ Otros llamamientos comunes
- Especialista de tecnología del barrio
- Representante de bienestar y autosuficiencia
- Especialista de comunicaciones
- Coordinador de actividades
- Director de deportes
- Especialista de justserve (servicio comunitario)
- Bibliotecario del barrio
- Coordinador de limpieza del edificio

## 4) Reglas de acceso vs. llamamientos

### Acceso (usuarios)
- Los usuarios con cuenta (`users`) se limitan a presidencias, consejeros y secretarios (o cualquier criterio que definas).
- El acceso se controla por `users.role` (permisos del sistema).

### Llamamientos (miembros)
- Todos los llamamientos se registran en `member_callings`, incluso si no hay cuenta.
- El directorio puede mostrar **todas las asignaciones** del miembro como distintivos.

## 5) Flujo recomendado (con pantallas actuales)

La idea es **mantener la gestión de usuarios en `/admin/users`** y **asignar llamamientos desde el directorio (`/directory`)**:

1) **Directorio (`/directory`)**: se crea o edita el miembro en `members`.
2) **Admin de usuarios (`/admin/users`)**: si requiere acceso, se crea o edita el usuario en `users` con `memberId`.
3) **Directorio (`/directory`)**: se asignan los llamamientos en `member_callings` (aunque no tenga cuenta).

## 6) Notas sobre sexo (F/M)

- Se mantiene el formato **F/M** en `members.sex`.
- La validación solo debe asegurar que los valores sean consistentes.

## 7) Mapeo inicial desde `users.role` a llamamientos

Para iniciar, los **usuarios existentes** pueden generar llamamientos equivalentes en `member_callings` con base en `users.role` y `organizationId`. Esto no cambia el acceso, solo **refleja el cargo en el directorio**:

- `obispo` → **Obispo** (Obispado)
- `consejero_obispo` → **Consejero del obispo** (Obispado)
- `secretario_ejecutivo` → **Secretario ejecutivo** (Obispado)
- `secretario` → **Secretario del barrio** (Obispado)
- `secretario_financiero` → **Secretario financiero** (Obispado)
- `presidente_organizacion` → **Presidente/Presidenta** (según organización)
- `consejero_organizacion` → **Consejero/Consejera** (según organización)
- `secretario_organizacion` → **Secretario/Secretaria** (según organización)

> Nota: el texto exacto del llamamiento puede ajustarse según tu preferencia, pero el objetivo es **separar acceso de cargo** y mostrarlo en el directorio.

## 8) Dónde se asignan los llamamientos en la UI

- **Automático al crear usuario**: si el usuario se crea con `memberId`, se genera un llamamiento básico según `users.role`.
- **Automático al dar de baja**: al eliminar la cuenta se elimina ese llamamiento básico asociado al `users.role`, pero se conservan los demás llamamientos manuales.
- **Directorio (`/directory`)** → desliza para **Editar** (o usa el botón de edición) en el miembro.
- En el **modal de edición** aparece el bloque **“Llamamientos”** con un botón **“Agregar”** para crear y **“Quitar”** para eliminar.
- Esto permite registrar llamamientos aunque la persona **no tenga cuenta** (o completar llamamientos adicionales que no requieren acceso).

## 9) Backfill desde `users.role` (script opcional)

Si quieres poblar llamamientos iniciales usando los roles actuales en `users`, ejecuta:

```bash
tsx scripts/backfill-member-callings.ts
```

El script:
- Toma `users.role`, `users.memberId` y `users.organizationId`.
- Genera llamamientos equivalentes en `member_callings`.
- No elimina ni modifica permisos de acceso.
