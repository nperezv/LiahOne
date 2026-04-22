ALTER TABLE members
  ADD COLUMN IF NOT EXISTS email_consent_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_date timestamp;
