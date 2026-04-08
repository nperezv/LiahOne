-- Recurring activity series (e.g. Noche de Hermanamiento every Friday)
CREATE TABLE IF NOT EXISTS recurring_series (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  location    text,
  day_of_week smallint NOT NULL DEFAULT 5,        -- 0=Sun … 6=Sat, 5=Fri
  time_of_day varchar(5) NOT NULL DEFAULT '20:00',
  rotation_org_ids jsonb NOT NULL DEFAULT '[]',   -- ordered array of org UUIDs
  rotation_start_date date NOT NULL,              -- date of the first occurrence (index 0)
  notify_days_before int NOT NULL DEFAULT 14,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now()
);

-- Link activities to a series + notification flag
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS recurring_series_id varchar
    REFERENCES recurring_series(id) ON DELETE SET NULL;
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS notified_rotation boolean NOT NULL DEFAULT false;
