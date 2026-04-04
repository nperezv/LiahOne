-- baptism_public_links was dropped in 0053_reset_mission_module.sql and never recreated.
CREATE TABLE IF NOT EXISTS "baptism_public_links" (
  "id"          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_id"  varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "slug"        text NOT NULL,
  "code"        text NOT NULL,
  "published_at" timestamptz NOT NULL,
  "expires_at"  timestamptz NOT NULL,
  "revoked_at"  timestamptz,
  "created_by"  varchar NOT NULL REFERENCES "users"("id"),
  "revoked_by"  varchar REFERENCES "users"("id"),
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS baptism_public_links_slug_idx ON baptism_public_links(slug);
CREATE INDEX IF NOT EXISTS baptism_public_links_service_id_idx ON baptism_public_links(service_id);
