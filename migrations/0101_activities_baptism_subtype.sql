-- Add baptism_subtype to activities to distinguish convert vs child baptisms
ALTER TABLE activities ADD COLUMN IF NOT EXISTS baptism_subtype text;

-- Backfill: existing servicio_bautismal activities linked to a service = convert
UPDATE activities
SET baptism_subtype = 'convert'
WHERE type = 'servicio_bautismal'
  AND baptism_service_id IS NOT NULL
  AND baptism_subtype IS NULL;
