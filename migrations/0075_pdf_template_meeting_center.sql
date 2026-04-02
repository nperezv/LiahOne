-- Add meeting center fields to pdf_templates for baptism service pre-fill
ALTER TABLE pdf_templates
  ADD COLUMN IF NOT EXISTS meeting_center_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meeting_center_address text NOT NULL DEFAULT '';
