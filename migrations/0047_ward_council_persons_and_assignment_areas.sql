-- Add area field to assignments (links assignment to one of the 4 §29.2.5 areas)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS area TEXT;

-- Add person arrays to ward_councils (one per §29.2.5 area)
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS living_gospel_persons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS care_for_others_persons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS missionary_persons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS family_history_persons JSONB DEFAULT '[]'::jsonb;

-- Additional notes field for the acta
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS additional_notes TEXT;
