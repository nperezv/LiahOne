-- Add task cards and budget request tracking for arreglo and refrigerio sections
ALTER TABLE baptism_service_logistics
  ADD COLUMN IF NOT EXISTS arreglo_tasks                   jsonb,
  ADD COLUMN IF NOT EXISTS arreglo_necesita_presupuesto   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS arreglo_presupuesto_solicitado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS refrigerio_necesita_presupuesto boolean DEFAULT false;
