ALTER TABLE pdf_templates
ADD COLUMN IF NOT EXISTS bizum_deep_link text DEFAULT '';
