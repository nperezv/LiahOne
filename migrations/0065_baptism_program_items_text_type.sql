-- Change program item type from enum to text for flexibility
ALTER TABLE baptism_program_items ALTER COLUMN "type" TYPE text USING "type"::text;
DROP TYPE IF EXISTS "baptism_program_item_type";

-- Add unique constraint on (service_id, type) to support upsert
DO $$ BEGIN
  ALTER TABLE baptism_program_items ADD CONSTRAINT baptism_program_items_service_type_unique UNIQUE (service_id, "type");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
