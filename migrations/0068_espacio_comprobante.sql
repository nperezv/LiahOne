-- Add comprobante (proof of reservation) fields to espacio y calendario
ALTER TABLE baptism_service_logistics
  ADD COLUMN IF NOT EXISTS espacio_comprobante_url    text,
  ADD COLUMN IF NOT EXISTS espacio_comprobante_nombre text;
