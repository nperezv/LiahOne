-- Create missing enums
DO $$ BEGIN CREATE TYPE organization_interview_status AS ENUM ('programada', 'completada', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE organization_interview_type AS ENUM ('regular', 'recomendacion_templo', 'llamamiento', 'inicial', 'otra'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create missing tables
CREATE TABLE IF NOT EXISTS organization_interviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id varchar NOT NULL REFERENCES organizations(id),
  date timestamptz NOT NULL,
  person_name text NOT NULL,
  interviewer_id varchar NOT NULL REFERENCES users(id),
  type organization_interview_type NOT NULL,
  status organization_interview_status NOT NULL DEFAULT 'programada',
  resolution archive_resolution,
  urgent boolean NOT NULL DEFAULT false,
  confidential boolean NOT NULL DEFAULT false,
  notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  archived_at timestamptz,
  created_by varchar NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Add missing columns to baja_requests
ALTER TABLE baja_requests ADD COLUMN IF NOT EXISTS apellidos text;
ALTER TABLE baja_requests ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE baja_requests ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendiente';
ALTER TABLE baja_requests ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE baja_requests ADD COLUMN IF NOT EXISTS processed_by varchar REFERENCES users(id);

-- Add missing column to inventory_movements
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();

-- Add missing columns found by schema audit
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS contact_consent_at timestamp;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS requires_registration boolean NOT NULL DEFAULT false;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS section_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE quarterly_plan_items ADD COLUMN IF NOT EXISTS activity_type varchar DEFAULT 'actividad_org';
ALTER TABLE quarterly_plan_items ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
