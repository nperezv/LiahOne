ALTER TABLE sacramental_meetings
  ADD COLUMN IF NOT EXISTS vote_results jsonb NOT NULL DEFAULT '{}'::jsonb;
