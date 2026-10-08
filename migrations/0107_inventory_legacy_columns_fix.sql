-- Alinea las tablas de inventario creadas por 0037 con el esquema actual.
-- (Se aplica también automáticamente al arrancar: server/startup-inventory-migrations.ts)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_items' AND column_name = 'qr_code_url') THEN
    UPDATE inventory_items SET qr_code_url = qr_url WHERE qr_code_url IS NULL AND qr_url IS NOT NULL;
    ALTER TABLE inventory_items ALTER COLUMN qr_code_url DROP NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'created_at') THEN
    ALTER TABLE inventory_movements ADD COLUMN created_at timestamp NOT NULL DEFAULT now();
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_movements' AND column_name = 'timestamp') THEN
      UPDATE inventory_movements SET created_at = "timestamp" WHERE "timestamp" IS NOT NULL;
    END IF;
  END IF;
END$$;

ALTER TABLE inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_name_key;
ALTER TABLE inventory_items ALTER COLUMN asset_code TYPE varchar(40);
