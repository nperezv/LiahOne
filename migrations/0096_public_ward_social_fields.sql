-- Social media and public contact fields for welcome page
ALTER TABLE pdf_templates
  ADD COLUMN IF NOT EXISTS instagram_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mission_office_email text NOT NULL DEFAULT '';
