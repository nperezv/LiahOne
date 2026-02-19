-- Backfill archived timestamp for legacy assignment rows already marked as archivada.
-- Some historical rows were converted to status=archivada without archived_at populated.

UPDATE assignments
SET archived_at = COALESCE(archived_at, updated_at, created_at, now())
WHERE status = 'archivada'
  AND archived_at IS NULL;

UPDATE assignments
SET cancelled_at = COALESCE(cancelled_at, archived_at, updated_at, created_at, now())
WHERE status = 'archivada'
  AND resolution = 'cancelada'
  AND cancelled_at IS NULL;
