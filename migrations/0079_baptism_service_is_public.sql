ALTER TABLE baptism_services ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
