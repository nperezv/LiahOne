-- Backfill para registros históricos que ya estaban completados/cancelados
-- antes de introducir archived_at/cancelled_at automáticos.

UPDATE assignments
SET archived_at = COALESCE(archived_at, updated_at, created_at, now())
WHERE status IN ('completada', 'cancelada')
  AND archived_at IS NULL;

UPDATE assignments
SET cancelled_at = COALESCE(cancelled_at, updated_at, created_at, now())
WHERE status = 'cancelada'
  AND cancelled_at IS NULL;

UPDATE interviews
SET archived_at = COALESCE(archived_at, updated_at, created_at, now())
WHERE status IN ('completada', 'cancelada', 'archivada')
  AND archived_at IS NULL;

UPDATE interviews
SET cancelled_at = COALESCE(cancelled_at, updated_at, created_at, now())
WHERE status = 'cancelada'
  AND cancelled_at IS NULL;

UPDATE organization_interviews
SET archived_at = COALESCE(archived_at, updated_at, created_at, now())
WHERE status IN ('completada', 'cancelada', 'archivada')
  AND archived_at IS NULL;

UPDATE organization_interviews
SET cancelled_at = COALESCE(cancelled_at, updated_at, created_at, now())
WHERE status = 'cancelada'
  AND cancelled_at IS NULL;
