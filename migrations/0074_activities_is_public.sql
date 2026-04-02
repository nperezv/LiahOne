-- Add is_public flag to activities for public landing page display
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
