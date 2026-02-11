CREATE TABLE IF NOT EXISTS "presidency_resources" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "organization_id" varchar,
  "created_by" varchar NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "presidency_resources_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "presidency_resources_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "presidency_resources_organization_id_idx"
  ON "presidency_resources" ("organization_id");

CREATE INDEX IF NOT EXISTS "presidency_resources_created_at_idx"
  ON "presidency_resources" ("created_at");
