CREATE TABLE IF NOT EXISTS "member_callings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" varchar NOT NULL REFERENCES "public"."members"("id"),
  "organization_id" varchar REFERENCES "public"."organizations"("id"),
  "calling_name" text NOT NULL,
  "calling_type" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "start_date" timestamp,
  "end_date" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "member_callings_member_id_idx" ON "member_callings" ("member_id");
