ALTER TABLE "mission_personas"
  ADD COLUMN IF NOT EXISTS "fecha_entrevista_bautismal" date,
  ADD COLUMN IF NOT EXISTS "fecha_visita_misioneros" date;
