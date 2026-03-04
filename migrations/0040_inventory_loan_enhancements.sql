DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'role' AND e.enumlabel = 'lider_actividades'
  ) THEN
    ALTER TYPE role ADD VALUE 'lider_actividades';
  END IF;
END$$;

ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS borrower_first_name text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS borrower_last_name text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS borrower_phone text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS borrower_email text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS expected_return_date date;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS signature_data_url text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS request_pdf_url text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS request_pdf_filename text;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS returned_by varchar REFERENCES users(id);
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS returned_at timestamp;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS return_has_incident boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS return_incident_notes text;
