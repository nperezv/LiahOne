-- Public unsubscribe/baja requests table
CREATE TABLE IF NOT EXISTS baja_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nombre text,
  reason text,
  created_at timestamp DEFAULT now() NOT NULL
);
