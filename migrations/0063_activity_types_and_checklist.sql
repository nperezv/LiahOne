-- Add activity type and status enums
DO $$ BEGIN
  CREATE TYPE "activity_type" AS ENUM (
    'servicio_bautismal',
    'deportiva',
    'capacitacion',
    'fiesta',
    'hermanamiento',
    'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "activity_status" AS ENUM (
    'borrador',
    'en_preparacion',
    'listo',
    'realizado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add new columns to activities table
ALTER TABLE "activities"
  ADD COLUMN IF NOT EXISTS "type" "activity_type" NOT NULL DEFAULT 'otro',
  ADD COLUMN IF NOT EXISTS "status" "activity_status" NOT NULL DEFAULT 'borrador',
  ADD COLUMN IF NOT EXISTS "baptism_service_id" varchar REFERENCES "baptism_services"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

-- Create activity_checklist_items table
CREATE TABLE IF NOT EXISTS "activity_checklist_items" (
  "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "activity_id"   varchar NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "item_key"      text NOT NULL,
  "label"         text NOT NULL,
  "completed"     boolean NOT NULL DEFAULT false,
  "completed_by"  varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_at"  timestamptz,
  "notes"         text,
  "sort_order"    integer NOT NULL DEFAULT 0,
  UNIQUE ("activity_id", "item_key")
);
