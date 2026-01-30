ALTER TYPE "public"."organization_type" ADD VALUE IF NOT EXISTS 'barrio';--> statement-breakpoint
CREATE TABLE "members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_surename" text NOT NULL,
	"sex" text NOT NULL,
	"birthday" timestamp NOT NULL,
	"phone" text,
	"email" text,
	"organization_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
