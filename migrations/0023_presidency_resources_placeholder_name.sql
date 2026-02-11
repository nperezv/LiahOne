ALTER TABLE "presidency_resources"
  ADD COLUMN IF NOT EXISTS "placeholder_name" text;

UPDATE "presidency_resources"
SET "placeholder_name" = COALESCE("placeholder_name", "title")
WHERE "placeholder_name" IS NULL;

ALTER TABLE "presidency_resources"
  ALTER COLUMN "placeholder_name" SET NOT NULL;
