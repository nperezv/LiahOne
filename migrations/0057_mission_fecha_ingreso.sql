ALTER TABLE "mission_personas"
  ADD COLUMN IF NOT EXISTS "fecha_ingreso" date NOT NULL DEFAULT CURRENT_DATE;
