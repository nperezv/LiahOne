ALTER TABLE organization_weekly_attendance
  ADD COLUMN IF NOT EXISTS attendee_member_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_members integer NOT NULL DEFAULT 0;
