# Unión de datos entre directorio y usuarios existentes

Este documento explica cómo **unir los usuarios ya existentes** con los registros del directorio (`members`) sin duplicar datos. El objetivo es **usar el directorio como fuente de verdad** y vincular cada cuenta con `memberId`.

## Paso a paso (resumen operativo)
1. **Respalda tu base de datos** antes de tocar nada.
2. **Aplica la migración nueva** (`0016_user_links_and_deletion_requests.sql`).
3. **Haz el emparejamiento automático** por email y/o teléfono con las consultas SQL de abajo.
4. **Revisa los casos ambiguos manualmente** en el panel de “Gestión de Usuarios”.
5. **Verifica resultados** (usuarios clave vinculados y acceso correcto).

## 1) Migraciones requeridas
El modelo usa las siguientes columnas/tablas:
- `users.member_id` (vínculo al directorio)
- `users.is_active` (revocar acceso sin borrar)
- `user_deletion_requests` (baja con doble confirmación)

Aplica la migración nueva antes de continuar.

## 2) Estrategia recomendada de unión (sin duplicar)
1. **Identifica coincidencias obvias** por email o teléfono.
2. **Asigna `member_id`** al usuario en esos casos.
3. **Revisa manualmente casos ambiguos** (mismo nombre, falta de email, etc.) usando el panel de “Gestión de Usuarios”.

La meta es que **cada usuario tenga `member_id`** cuando exista su registro en el directorio.

## 3) Consultas SQL de ayuda (automatizado)

> Asegúrate de revisar los resultados antes de actualizar. Si hay dudas, deja esos usuarios para revisión manual.

### 3.1 Coincidencias por email
```sql
SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email,
       m.id AS member_id, m.name_surename AS member_name, m.email AS member_email
FROM users u
JOIN members m ON lower(u.email) = lower(m.email)
WHERE u.member_id IS NULL
  AND u.email IS NOT NULL
  AND m.email IS NOT NULL;
```

Para asignar:
```sql
UPDATE users u
SET member_id = m.id
FROM members m
WHERE lower(u.email) = lower(m.email)
  AND u.member_id IS NULL
  AND u.email IS NOT NULL
  AND m.email IS NOT NULL;
```

### 3.2 Coincidencias por teléfono
```sql
SELECT u.id AS user_id, u.name AS user_name, u.phone AS user_phone,
       m.id AS member_id, m.name_surename AS member_name, m.phone AS member_phone
FROM users u
JOIN members m ON u.phone = m.phone
WHERE u.member_id IS NULL
  AND u.phone IS NOT NULL
  AND m.phone IS NOT NULL;
```

Para asignar:
```sql
UPDATE users u
SET member_id = m.id
FROM members m
WHERE u.phone = m.phone
  AND u.member_id IS NULL
  AND u.phone IS NOT NULL
  AND m.phone IS NOT NULL;
```

### 3.3 Coincidencias por nombre (solo para revisión)
```sql
SELECT u.id AS user_id, u.name AS user_name,
       m.id AS member_id, m.name_surename AS member_name
FROM users u
JOIN members m ON lower(u.name) = lower(m.name_surename)
WHERE u.member_id IS NULL;
```

> **Nota:** evita actualizaciones automáticas por nombre. Úsalo solo como listado para revisión manual.

## 4) Revisión manual desde el panel
Para los casos ambiguos o sin email/teléfono:
1. Entra a **Gestión de Usuarios**.
2. Edita el usuario y selecciona el miembro del directorio en el selector “Vincular miembro del directorio”.
3. Guarda cambios.

## 5) Verificación final (checklist)
- **Obispo y consejeros**: verificar que su `memberId` quedó vinculado y el acceso sigue activo.
- **Secretarios**: verificar que pueden crear cuentas y solicitar bajas.
- **Líderes relevados**: dejar `Acceso activo = OFF` en lugar de borrar.

## 5) Buenas prácticas posteriores
- **Nuevos líderes:** crear la cuenta **vinculando** primero el miembro del directorio.
- **Relevos:** usar `Acceso activo = OFF` (no borrar).
- **Baja definitiva:** usar el flujo con solicitud + aprobación del obispo.
