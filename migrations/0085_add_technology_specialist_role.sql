DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'role' AND e.enumlabel = 'technology_specialist'
  ) THEN
    ALTER TYPE role ADD VALUE 'technology_specialist';
  END IF;
END$$;
