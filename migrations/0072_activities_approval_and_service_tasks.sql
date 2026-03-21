-- Add approval and planning columns to activities table
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS objetivo             text,
  ADD COLUMN IF NOT EXISTS expectativas         text,
  ADD COLUMN IF NOT EXISTS asistencia_esperada  integer,
  ADD COLUMN IF NOT EXISTS metas                text,
  ADD COLUMN IF NOT EXISTS approval_status      text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approval_comment     text,
  ADD COLUMN IF NOT EXISTS submitted_at         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_at          timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by          varchar REFERENCES users(id);

-- Create service_tasks table
CREATE TABLE IF NOT EXISTS service_tasks (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  baptism_service_id varchar REFERENCES baptism_services(id) ON DELETE CASCADE,
  activity_id      varchar REFERENCES activities(id) ON DELETE CASCADE,
  assigned_to      varchar REFERENCES users(id),
  assigned_role    text,
  organization_id  varchar REFERENCES organizations(id),
  title            text,
  description      text,
  status           text NOT NULL DEFAULT 'pending',
  due_date         timestamp with time zone,
  completed_at     timestamp with time zone,
  created_by       varchar REFERENCES users(id),
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now()
);
