DO $$ BEGIN CREATE TYPE "baptism_approval_status" AS ENUM ('draft', 'pending_approval', 'approved', 'needs_revision'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "baptism_services"
  ADD COLUMN IF NOT EXISTS "approval_status" "baptism_approval_status" NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "approval_comment" text,
  ADD COLUMN IF NOT EXISTS "approved_by" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "approved_at" timestamptz;
