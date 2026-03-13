ALTER TABLE "mission_contacts"
  ADD COLUMN IF NOT EXISTS "fellowship_user_id" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "fellowship_name" text;

CREATE TABLE IF NOT EXISTS "mission_church_attendance" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "attended_at" date NOT NULL,
  "noted_by" varchar NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("contact_id", "attended_at")
);
CREATE INDEX IF NOT EXISTS mission_church_attendance_contact_idx ON "mission_church_attendance"("contact_id", "attended_at" DESC);

DO $$ BEGIN CREATE TYPE "mission_task_priority" AS ENUM ('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_task_status" AS ENUM ('open', 'done', 'canceled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "mission_coordination_tasks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id" varchar NOT NULL REFERENCES "organizations"("id"),
  "contact_id" varchar REFERENCES "mission_contacts"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "owner_user_id" varchar REFERENCES "users"("id"),
  "owner_name" text,
  "priority" "mission_task_priority" NOT NULL DEFAULT 'medium',
  "status" "mission_task_status" NOT NULL DEFAULT 'open',
  "due_at" timestamptz,
  "completed_at" timestamptz,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mission_coordination_tasks_unit_idx ON "mission_coordination_tasks"("unit_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS mission_coordination_tasks_owner_idx ON "mission_coordination_tasks"("owner_user_id", "status");
CREATE INDEX IF NOT EXISTS mission_coordination_tasks_contact_idx ON "mission_coordination_tasks"("contact_id") WHERE "contact_id" IS NOT NULL;
