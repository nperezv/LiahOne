ALTER TABLE access_requests
  ADD COLUMN nombre text,
  ADD COLUMN apellidos text,
  ADD COLUMN sex text,
  ADD COLUMN birthday timestamp with time zone,
  ADD COLUMN consent_email boolean NOT NULL DEFAULT false,
  ADD COLUMN consent_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN member_id varchar REFERENCES members(id);
