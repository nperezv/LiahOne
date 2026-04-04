ALTER TABLE baptism_services ADD COLUMN IF NOT EXISTS visibility_confirmed boolean NOT NULL DEFAULT false;
