-- New columns on mission_contacts
ALTER TABLE "mission_contacts"
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "member_user_id" varchar REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;

-- Detail JSONB on attendance (per-Sunday detail for friends)
ALTER TABLE "mission_church_attendance"
  ADD COLUMN IF NOT EXISTS "detail" jsonb;

-- Unified covenant path progress (recent_convert + less_active)
-- One row per contact+item, with 3 independent stage fields
CREATE TABLE IF NOT EXISTS "mission_covenant_path_progress" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "item_key" text NOT NULL,
  "lesson_status" text NOT NULL DEFAULT 'not_started',   -- not_started | taught | completed
  "commitment_status" text NOT NULL DEFAULT 'pending',    -- pending | committed | not_committed
  "milestone_status" text NOT NULL DEFAULT 'pending',     -- pending | done | waived
  "notes" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("contact_id", "item_key")
);
CREATE INDEX IF NOT EXISTS mission_covenant_path_contact_idx ON "mission_covenant_path_progress"("contact_id");

-- Friend progress sections (9 sections stored as JSONB per section)
CREATE TABLE IF NOT EXISTS "mission_friend_section_data" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "section_key" text NOT NULL,   -- s1_friendship | s2_attendance | s3_prayer | s4_lessons | s5_commitments | s6_support | s7_interview | s8_baptism | s9_post_baptism
  "data" jsonb NOT NULL DEFAULT '{}',
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("contact_id", "section_key")
);
CREATE INDEX IF NOT EXISTS mission_friend_section_contact_idx ON "mission_friend_section_data"("contact_id");
