ALTER TABLE public.organization_weekly_attendance
  ADD COLUMN IF NOT EXISTS week_key date;

UPDATE public.organization_weekly_attendance
SET week_key = DATE(week_start_date)
WHERE week_key IS NULL;

ALTER TABLE public.organization_weekly_attendance
  ALTER COLUMN week_key SET NOT NULL;

DROP INDEX IF EXISTS organization_weekly_attendance_org_week_idx;
CREATE UNIQUE INDEX IF NOT EXISTS organization_weekly_attendance_org_week_key_idx
  ON public.organization_weekly_attendance (organization_id, week_key);

CREATE TABLE IF NOT EXISTS public.organization_attendance_monthly_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id varchar NOT NULL REFERENCES public.organizations(id),
  year integer NOT NULL,
  month integer NOT NULL,
  weeks_in_month integer NOT NULL DEFAULT 0,
  weeks_reported integer NOT NULL DEFAULT 0,
  present_total integer NOT NULL DEFAULT 0,
  capacity_total integer NOT NULL DEFAULT 0,
  attendance_percent numeric(5,2) NOT NULL DEFAULT 0,
  closed_at timestamp NOT NULL DEFAULT now(),
  closed_by varchar NOT NULL REFERENCES public.users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_attendance_monthly_snapshots_org_month_idx
  ON public.organization_attendance_monthly_snapshots (organization_id, year, month);
