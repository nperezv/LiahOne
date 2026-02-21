ALTER TABLE pdf_templates
ADD COLUMN IF NOT EXISTS bizum_phone text DEFAULT '';
