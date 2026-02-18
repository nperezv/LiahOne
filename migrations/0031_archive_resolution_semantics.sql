-- Add semantic resolution for archived entities.
-- Status remains lifecycle/visibility; resolution keeps business outcome.

DO $$ BEGIN
  CREATE TYPE "public"."archive_resolution" AS ENUM ('completada', 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS resolution "public"."archive_resolution";
ALTER TABLE organization_interviews ADD COLUMN IF NOT EXISTS resolution "public"."archive_resolution";
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS resolution "public"."archive_resolution";

-- Backfill existing semantic statuses into archived + resolution
UPDATE interviews
SET
  resolution = CASE
    WHEN status = 'cancelada' THEN 'cancelada'::"public"."archive_resolution"
    ELSE 'completada'::"public"."archive_resolution"
  END,
  status = 'archivada'
WHERE status IN ('completada', 'cancelada');

UPDATE organization_interviews
SET
  resolution = CASE
    WHEN status = 'cancelada' THEN 'cancelada'::"public"."archive_resolution"
    ELSE 'completada'::"public"."archive_resolution"
  END,
  status = 'archivada'
WHERE status IN ('completada', 'cancelada');

UPDATE assignments
SET
  resolution = CASE
    WHEN status = 'cancelada' THEN 'cancelada'::"public"."archive_resolution"
    ELSE 'completada'::"public"."archive_resolution"
  END,
  status = 'archivada'
WHERE status IN ('completada', 'cancelada');


-- Fill unresolved archived rows (legacy). Infer cancel when notes mention cancelación.
UPDATE interviews
SET resolution = CASE
  WHEN COALESCE(notes, '') ILIKE '%cancel%' THEN 'cancelada'::"public"."archive_resolution"
  ELSE 'completada'::"public"."archive_resolution"
END
WHERE status = 'archivada' AND resolution IS NULL;

UPDATE organization_interviews
SET resolution = CASE
  WHEN COALESCE(notes, '') ILIKE '%cancel%' THEN 'cancelada'::"public"."archive_resolution"
  ELSE 'completada'::"public"."archive_resolution"
END
WHERE status = 'archivada' AND resolution IS NULL;

UPDATE assignments
SET resolution = CASE
  WHEN COALESCE(notes, '') ILIKE '%cancel%' THEN 'cancelada'::"public"."archive_resolution"
  ELSE 'completada'::"public"."archive_resolution"
END
WHERE status = 'archivada' AND resolution IS NULL;
