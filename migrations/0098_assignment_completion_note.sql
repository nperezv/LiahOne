-- Mandatory completion note when leaders mark an assignment as completed
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS completion_note text;
