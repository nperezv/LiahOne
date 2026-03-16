-- Allow baptism services to be linked to mission_personas (new system)
-- while keeping backward compatibility with mission_contacts (old system)
ALTER TABLE "baptism_services"
  ALTER COLUMN "candidate_contact_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "candidate_persona_id" varchar REFERENCES "mission_personas"("id") ON DELETE SET NULL;
