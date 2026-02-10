ALTER TABLE sacramental_meetings
ADD COLUMN IF NOT EXISTS assignments jsonb DEFAULT '[]'::jsonb;
