ALTER TABLE "interviews"
  ALTER COLUMN "date" TYPE timestamptz USING "date" AT TIME ZONE 'UTC';

ALTER TABLE "organization_interviews"
  ALTER COLUMN "date" TYPE timestamptz USING "date" AT TIME ZONE 'UTC';
