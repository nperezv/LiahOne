-- Recreate baptism service tables for the new mission_personas system.
-- The old tables were dropped in 0053_reset_mission_module.sql.
-- This version links to mission_personas instead of mission_contacts.

-- ENUMs (idempotent)
DO $$ BEGIN CREATE TYPE "baptism_service_status"       AS ENUM ('scheduled','live','completed','archived');       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_program_item_type"    AS ENUM ('opening_prayer','hymn','talk','special_music','ordinance_baptism','closing_prayer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_assignment_type"      AS ENUM ('refreshments','cleaning','baptism_clothing','wet_clothes_pickup','reception','music'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_assignment_status"    AS ENUM ('pending','done');                                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "baptism_approval_status"      AS ENUM ('draft','pending_approval','approved','needs_revision'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main service table
CREATE TABLE IF NOT EXISTS "baptism_services" (
  "id"                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id"             varchar NOT NULL REFERENCES "organizations"("id"),
  "candidate_persona_id" varchar REFERENCES "mission_personas"("id") ON DELETE SET NULL,
  "service_at"          timestamptz NOT NULL,
  "location_name"       text NOT NULL,
  "location_address"    text,
  "maps_url"            text,
  "status"              "baptism_service_status" NOT NULL DEFAULT 'scheduled',
  "approval_status"     "baptism_approval_status" NOT NULL DEFAULT 'draft',
  "approval_comment"    text,
  "approved_by"         varchar REFERENCES "users"("id"),
  "approved_at"         timestamptz,
  "prep_deadline_at"    timestamptz NOT NULL,
  "created_by"          varchar NOT NULL REFERENCES "users"("id"),
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

-- Program items
CREATE TABLE IF NOT EXISTS "baptism_program_items" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id"              varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "order"                   integer NOT NULL DEFAULT 0,
  "type"                    "baptism_program_item_type" NOT NULL,
  "title"                   text,
  "participant_user_id"     varchar REFERENCES "users"("id"),
  "participant_display_name" text,
  "public_visibility"       boolean NOT NULL DEFAULT true,
  "hymn_id"                 uuid REFERENCES "hymns"("id"),
  "notes"                   text,
  "updated_by"              varchar REFERENCES "users"("id"),
  "updated_at"              timestamptz
);

-- Assignments (tasks per service)
CREATE TABLE IF NOT EXISTS "baptism_assignments" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id"       varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "type"             "baptism_assignment_type" NOT NULL,
  "assignee_user_id" varchar REFERENCES "users"("id"),
  "assignee_name"    text,
  "status"           "baptism_assignment_status" NOT NULL DEFAULT 'pending',
  "due_at"           timestamptz,
  "notes"            text
);

-- Notification dedup log
CREATE TABLE IF NOT EXISTS "baptism_notification_deliveries" (
  "id"           varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id"   varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "rule"         text NOT NULL,
  "dedupe_key"   text NOT NULL UNIQUE,
  "delivered_at" timestamptz NOT NULL DEFAULT now()
);
