-- Add multiple responsables and detail field to refrigerio section
ALTER TABLE baptism_service_logistics
  ADD COLUMN IF NOT EXISTS refrigerio_responsables text[],
  ADD COLUMN IF NOT EXISTS refrigerio_detalle       text;
