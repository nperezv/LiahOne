-- baptism_public_posts was dropped in 0053_reset_mission_module.sql and never recreated.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'baptism_public_post_status') THEN
    CREATE TYPE "baptism_public_post_status" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

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
