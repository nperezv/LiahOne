-- inventory enterprise upgrade (category prefixes, hierarchical locations, NFC, audits)

ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS prefix varchar(20),
  ADD COLUMN IF NOT EXISTS description text;

UPDATE inventory_categories
SET prefix = COALESCE(prefix, upper(substring(regexp_replace(name, '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 4)) || 'BM8')
WHERE prefix IS NULL;

ALTER TABLE inventory_categories
  ALTER COLUMN prefix SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_prefix_unique') THEN
    ALTER TABLE inventory_categories ADD CONSTRAINT inventory_categories_prefix_unique UNIQUE(prefix);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS inventory_category_counters (
  category_id varchar PRIMARY KEY REFERENCES inventory_categories(id) ON DELETE CASCADE,
  next_seq int NOT NULL DEFAULT 1
);

INSERT INTO inventory_category_counters (category_id, next_seq)
SELECT c.id, COALESCE(MAX((regexp_match(i.asset_code, '-(\\d+)$'))[1]::int), 0) + 1
FROM inventory_categories c
LEFT JOIN inventory_items i ON i.category_id = c.id
GROUP BY c.id
ON CONFLICT (category_id) DO NOTHING;

ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS parent_id varchar REFERENCES inventory_locations(id),
  ADD COLUMN IF NOT EXISTS code varchar(40);

UPDATE inventory_locations l
SET code = COALESCE(
  code,
  'LOC-' ||
  COALESCE((
    SELECT string_agg(
      CASE WHEN token ~ '^[0-9]+$' THEN token ELSE upper(left(token, 1)) END,
      ''
    )
    FROM regexp_split_to_table(COALESCE((SELECT ward_name FROM pdf_templates LIMIT 1), 'Barrio Madrid 8'), '\s+') AS token
  ), 'BM8')
  || '-LOC-' || lpad((row_number() over (order by l.created_at))::text, 2, '0')
)
WHERE code IS NULL;

ALTER TABLE inventory_locations
  ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_locations_code_unique') THEN
    ALTER TABLE inventory_locations ADD CONSTRAINT inventory_locations_code_unique UNIQUE(code);
  END IF;
END$$;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS qr_url text,
  ADD COLUMN IF NOT EXISTS tracker_id varchar(120);

UPDATE inventory_items
SET qr_url = COALESCE(qr_url, qr_code_url)
WHERE qr_url IS NULL;

ALTER TABLE inventory_items
  ALTER COLUMN qr_url SET NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_audits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_audit_items (
  audit_id varchar NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  item_id varchar NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamp,
  verified_by varchar REFERENCES users(id),
  PRIMARY KEY (audit_id, item_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_nfc_target_type') THEN
    CREATE TYPE inventory_nfc_target_type AS ENUM ('item', 'location');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_nfc_links (
  uid varchar(100) PRIMARY KEY,
  target_type inventory_nfc_target_type NOT NULL,
  target_id varchar NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE inventory_loans
  ADD COLUMN IF NOT EXISTS borrower_contact text;

ALTER TABLE inventory_loans
  ALTER COLUMN date_out TYPE date USING date_out::date,
  ALTER COLUMN date_return TYPE date USING date_return::date;
