DO $$ BEGIN
  CREATE TYPE "user_deletion_request_status" AS ENUM ('pendiente', 'aprobada', 'rechazada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "member_id" varchar;

DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_deletion_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "public"."users"("id"),
  "requested_by" varchar NOT NULL REFERENCES "public"."users"("id"),
  "reason" text,
  "status" "user_deletion_request_status" NOT NULL DEFAULT 'pendiente',
  "reviewed_by" varchar REFERENCES "public"."users"("id"),
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
