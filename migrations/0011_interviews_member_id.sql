ALTER TABLE "interviews" ADD COLUMN "member_id" varchar;
--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
