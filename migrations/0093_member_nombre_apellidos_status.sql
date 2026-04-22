CREATE TYPE member_status AS ENUM ('active', 'pending');

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellidos text,
  ADD COLUMN IF NOT EXISTS member_status member_status NOT NULL DEFAULT 'active';

-- Best-effort split of existing names:
-- If name has a comma ("García López, María") → split on first comma
-- Otherwise → leave NULL so leaders complete via profile
UPDATE members SET
  apellidos = trim(split_part(name_surename, ',', 1)),
  nombre    = trim(split_part(name_surename, ',', 2))
WHERE name_surename LIKE '%,%'
  AND nombre IS NULL;
