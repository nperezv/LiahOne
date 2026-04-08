-- Add slug, flyer_url, quarterly_plan_item_id to activities
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS slug             varchar UNIQUE,
  ADD COLUMN IF NOT EXISTS flyer_url        text,
  ADD COLUMN IF NOT EXISTS quarterly_plan_item_id varchar REFERENCES quarterly_plan_items(id) ON DELETE SET NULL;

-- Add actividad_org to activity_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'activity_type' AND e.enumlabel = 'actividad_org'
  ) THEN
    ALTER TYPE activity_type ADD VALUE 'actividad_org';
  END IF;
END$$;
