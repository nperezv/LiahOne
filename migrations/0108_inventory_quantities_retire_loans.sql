-- Inventario: cantidades, dar de baja, préstamos a miembros, avisos de vencidos y revisión de armarios.
-- (Se aplica también automáticamente al arrancar: server/startup-inventory-migrations.ts)
ALTER TYPE inventory_item_status ADD VALUE IF NOT EXISTS 'retired';

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS retired_at timestamp;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS retired_reason text;

ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS member_id varchar;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS overdue_notified_at timestamp;

ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS last_checked_at timestamp;
