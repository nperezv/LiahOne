DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'assignment_status' AND e.enumlabel = 'cancelada'
  ) THEN
    ALTER TYPE assignment_status ADD VALUE 'cancelada';
  END IF;
END $$;

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE organization_interviews
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS interviews_archived_at_idx ON interviews (archived_at);
CREATE INDEX IF NOT EXISTS organization_interviews_archived_at_idx ON organization_interviews (archived_at);
CREATE INDEX IF NOT EXISTS assignments_archived_at_idx ON assignments (archived_at);
