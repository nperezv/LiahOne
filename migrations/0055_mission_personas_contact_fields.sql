ALTER TABLE "mission_personas"
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "email" text,
  ADD COLUMN IF NOT EXISTS "member_id" varchar REFERENCES "members"("id") ON DELETE SET NULL;
