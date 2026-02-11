DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'budget_category'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.budget_category AS ENUM ('actividades', 'materiales', 'otros');
  END IF;
END $$;

ALTER TABLE public.budget_requests
  ADD COLUMN IF NOT EXISTS category public.budget_category;

UPDATE public.budget_requests
SET category = 'otros'
WHERE category IS NULL;

ALTER TABLE public.budget_requests
  ALTER COLUMN category SET DEFAULT 'otros',
  ALTER COLUMN category SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.organization_weekly_attendance (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id varchar NOT NULL REFERENCES public.organizations(id),
  week_start_date timestamp NOT NULL,
  attendees_count integer NOT NULL DEFAULT 0,
  created_by varchar NOT NULL REFERENCES public.users(id),
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_weekly_attendance_org_week_idx
  ON public.organization_weekly_attendance (organization_id, week_start_date);
