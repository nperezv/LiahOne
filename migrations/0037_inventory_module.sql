CREATE TYPE inventory_item_status AS ENUM ('available', 'loaned', 'maintenance');
CREATE TYPE inventory_loan_status AS ENUM ('active', 'returned', 'overdue');

CREATE TABLE inventory_categories (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE inventory_locations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code varchar(30) NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category_id varchar REFERENCES inventory_categories(id),
  location_id varchar REFERENCES inventory_locations(id),
  status inventory_item_status NOT NULL DEFAULT 'available',
  qr_code_url text NOT NULL,
  nfc_uid varchar(120),
  tracker_id varchar(120),
  photo_url text,
  last_verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE inventory_movements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id varchar NOT NULL REFERENCES inventory_items(id),
  from_location varchar REFERENCES inventory_locations(id),
  to_location varchar REFERENCES inventory_locations(id),
  user_id varchar NOT NULL REFERENCES users(id),
  "timestamp" timestamp NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE inventory_loans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id varchar NOT NULL REFERENCES inventory_items(id),
  borrower_name text NOT NULL,
  date_out timestamp NOT NULL,
  date_return timestamp,
  status inventory_loan_status NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now()
);
