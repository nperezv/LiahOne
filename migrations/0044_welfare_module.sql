CREATE TYPE welfare_status AS ENUM ('solicitado', 'aprobado', 'rechazada');

CREATE TABLE welfare_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR REFERENCES organizations(id),
  requested_by VARCHAR NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status welfare_status NOT NULL DEFAULT 'solicitado',
  request_type TEXT DEFAULT 'pago_adelantado',
  activity_date TIMESTAMP,
  bishop_approved_by VARCHAR REFERENCES users(id),
  bishop_approved_at TIMESTAMP,
  bishop_signature_data_url TEXT,
  bishop_signature_ip TEXT,
  bishop_signature_user_agent TEXT,
  bishop_signed_plan_filename TEXT,
  bishop_signed_plan_url TEXT,
  receipts JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  pagar_a TEXT,
  applicant_signature_data_url TEXT,
  welfare_categories_json JSONB DEFAULT '[]'::jsonb,
  bank_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
