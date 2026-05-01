-- Allow niño inscrito baptisms: candidates without a mission_persona record
ALTER TABLE baptism_service_candidates
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);

ALTER TABLE baptism_service_candidates
  ALTER COLUMN persona_id DROP NOT NULL;
