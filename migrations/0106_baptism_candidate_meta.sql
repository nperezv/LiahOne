ALTER TABLE baptism_services ADD COLUMN IF NOT EXISTS candidate_meta jsonb NOT NULL DEFAULT '[]'::jsonb;
