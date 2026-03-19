-- Add participants list and preparation time to arreglo de espacios
ALTER TABLE baptism_service_logistics
  ADD COLUMN IF NOT EXISTS arreglo_participantes text[],
  ADD COLUMN IF NOT EXISTS arreglo_hora          text;
