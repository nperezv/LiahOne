DO $$ BEGIN
  ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'mission_leader';
  ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'ward_missionary';
  ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'full_time_missionary';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "mission_person_type" AS ENUM ('friend','recent_convert','less_active'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_assignee_role" AS ENUM ('missionary','member_friend','leader'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_item_type" AS ENUM ('lesson','commitment','checkpoint','habit','milestone'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_lesson_status" AS ENUM ('not_started','taught','completed','repeated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_commitment_result" AS ENUM ('pending','done','not_done','partial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "mission_milestone_status" AS ENUM ('pending','done','waived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_service_status" AS ENUM ('scheduled','live','completed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_program_item_type" AS ENUM ('opening_prayer','hymn','talk','special_music','ordinance_baptism','closing_prayer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_assignment_type" AS ENUM ('refreshments','cleaning','baptism_clothing','wet_clothes_pickup','reception','music'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_assignment_status" AS ENUM ('pending','done'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_public_post_status" AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "hymns" ADD COLUMN IF NOT EXISTS "hymnbook" text NOT NULL DEFAULT 'default';
ALTER TABLE "hymns" ADD COLUMN IF NOT EXISTS "lang" text NOT NULL DEFAULT 'es';
ALTER TABLE "hymns" ADD COLUMN IF NOT EXISTS "external_url" text;

CREATE TABLE IF NOT EXISTS "mission_contacts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id" varchar NOT NULL REFERENCES "organizations"("id"),
  "full_name" text NOT NULL,
  "phone" text,
  "email" text,
  "person_type" "mission_person_type" NOT NULL,
  "stage" text NOT NULL DEFAULT 'new',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mission_contact_assignees" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "user_id" varchar REFERENCES "users"("id"),
  "assignee_name" text,
  "assignee_role" "mission_assignee_role" NOT NULL DEFAULT 'missionary',
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mission_contact_assignees_contact_user_role_idx ON mission_contact_assignees(contact_id, user_id, assignee_role);

CREATE TABLE IF NOT EXISTS "mission_contact_notes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "author_user_id" varchar NOT NULL REFERENCES "users"("id"),
  "note" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mission_track_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id" varchar NOT NULL REFERENCES "organizations"("id"),
  "person_type" "mission_person_type" NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mission_template_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_id" varchar NOT NULL REFERENCES "mission_track_templates"("id") ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 0,
  "title" text NOT NULL,
  "item_type" "mission_item_type" NOT NULL,
  "required" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "mission_contact_lessons" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "template_item_id" varchar NOT NULL REFERENCES "mission_template_items"("id"),
  "status" "mission_lesson_status" NOT NULL DEFAULT 'not_started',
  "taught_at" timestamptz,
  "completed_at" timestamptz,
  "teacher_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text
);

CREATE TABLE IF NOT EXISTS "mission_contact_commitments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "template_item_id" varchar NOT NULL REFERENCES "mission_template_items"("id"),
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  "due_at" timestamptz,
  "result" "mission_commitment_result" NOT NULL DEFAULT 'pending',
  "completed_at" timestamptz,
  "note" text
);

CREATE TABLE IF NOT EXISTS "mission_contact_milestones" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id") ON DELETE CASCADE,
  "template_item_id" varchar NOT NULL REFERENCES "mission_template_items"("id"),
  "status" "mission_milestone_status" NOT NULL DEFAULT 'pending',
  "done_at" timestamptz,
  "done_by" varchar REFERENCES "users"("id"),
  "note" text,
  UNIQUE(contact_id, template_item_id)
);

CREATE TABLE IF NOT EXISTS "baptism_services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id" varchar NOT NULL REFERENCES "organizations"("id"),
  "candidate_contact_id" varchar NOT NULL REFERENCES "mission_contacts"("id"),
  "service_at" timestamptz NOT NULL,
  "location_name" text NOT NULL,
  "location_address" text,
  "maps_url" text,
  "status" "baptism_service_status" NOT NULL DEFAULT 'scheduled',
  "prep_deadline_at" timestamptz NOT NULL,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "baptism_program_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "order" integer NOT NULL DEFAULT 0,
  "type" "baptism_program_item_type" NOT NULL,
  "title" text,
  "participant_user_id" varchar REFERENCES "users"("id"),
  "participant_display_name" text,
  "public_visibility" boolean NOT NULL DEFAULT true,
  "hymn_id" varchar REFERENCES "hymns"("id"),
  "notes" text,
  "updated_by" varchar REFERENCES "users"("id"),
  "updated_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "baptism_assignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "type" "baptism_assignment_type" NOT NULL,
  "assignee_user_id" varchar REFERENCES "users"("id"),
  "assignee_name" text,
  "status" "baptism_assignment_status" NOT NULL DEFAULT 'pending',
  "due_at" timestamptz,
  "notes" text
);

CREATE TABLE IF NOT EXISTS "baptism_public_links" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "slug" text NOT NULL UNIQUE,
  "code" text NOT NULL,
  "published_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "revoked_by" varchar REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "baptism_public_posts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "public_link_id" varchar NOT NULL REFERENCES "baptism_public_links"("id") ON DELETE CASCADE,
  "display_name" text,
  "message" text NOT NULL,
  "photo_url" text,
  "status" "baptism_public_post_status" NOT NULL DEFAULT 'pending',
  "client_request_id" text NOT NULL,
  "ip_hash" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "moderated_by" varchar REFERENCES "users"("id"),
  "moderated_at" timestamptz,
  UNIQUE(public_link_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS "baptism_notification_deliveries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id" varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "rule" text NOT NULL,
  "dedupe_key" text NOT NULL UNIQUE,
  "delivered_at" timestamptz NOT NULL DEFAULT now()
);
