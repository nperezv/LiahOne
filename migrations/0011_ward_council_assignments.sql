ALTER TABLE "ward_councils"
  ADD COLUMN "new_assignments" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN "assignment_ids" jsonb DEFAULT '[]'::jsonb;
