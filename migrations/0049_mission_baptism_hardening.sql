-- Allow link session history with same stable slug across re-publish
DO $$ BEGIN
  ALTER TABLE "baptism_public_links" DROP CONSTRAINT IF EXISTS "baptism_public_links_slug_unique";
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DROP INDEX IF EXISTS "baptism_public_links_slug_unique";
CREATE INDEX IF NOT EXISTS baptism_public_links_slug_idx ON baptism_public_links(slug);

-- Make upserts valid for lessons/commitments
CREATE UNIQUE INDEX IF NOT EXISTS mission_contact_lessons_contact_template_idx
  ON mission_contact_lessons(contact_id, template_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS mission_contact_commitments_contact_template_idx
  ON mission_contact_commitments(contact_id, template_item_id);
