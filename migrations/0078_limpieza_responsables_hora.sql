ALTER TABLE baptism_service_logistics
  ADD COLUMN IF NOT EXISTS limpieza_responsables text[],
  ADD COLUMN IF NOT EXISTS limpieza_hora text;
