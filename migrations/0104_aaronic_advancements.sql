ALTER TABLE sacramental_meetings
  ADD COLUMN IF NOT EXISTS aaronic_advancements jsonb NOT NULL DEFAULT '[]'::jsonb;
