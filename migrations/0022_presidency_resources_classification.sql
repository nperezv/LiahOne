DO $$ BEGIN
  CREATE TYPE "presidency_resource_category" AS ENUM ('manuales', 'plantillas', 'capacitacion');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "presidency_resource_type" AS ENUM ('documento', 'video', 'plantilla');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "presidency_resources"
  ADD COLUMN IF NOT EXISTS "category" "presidency_resource_category";

ALTER TABLE "presidency_resources"
  ADD COLUMN IF NOT EXISTS "resource_type" "presidency_resource_type";

UPDATE "presidency_resources"
SET "category" = COALESCE("category", 'manuales'::"presidency_resource_category"),
    "resource_type" = COALESCE("resource_type", 'documento'::"presidency_resource_type");

ALTER TABLE "presidency_resources"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "resource_type" SET NOT NULL;
