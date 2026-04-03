ALTER TABLE mission_personas
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
