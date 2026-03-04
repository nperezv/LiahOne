DO $$ BEGIN
  CREATE TYPE agenda_event_source AS ENUM ('manual', 'activity', 'interview');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agenda_task_priority AS ENUM ('P1', 'P2', 'P3', 'P4');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agenda_task_status AS ENUM ('open', 'done', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agenda_reminder_channel AS ENUM ('push', 'email');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agenda_reminder_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_plan_status AS ENUM ('planned', 'done', 'bumped', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_plan_generated_by AS ENUM ('planner', 'manual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS agenda_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  date date NOT NULL,
  start_time text,
  end_time text,
  location text,
  source_type agenda_event_source NOT NULL DEFAULT 'manual',
  source_id varchar,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text,
  due_at timestamp,
  earliest_start_at timestamp,
  duration_minutes integer NOT NULL DEFAULT 30,
  priority agenda_task_priority NOT NULL DEFAULT 'P3',
  status agenda_task_status NOT NULL DEFAULT 'open',
  event_id varchar REFERENCES agenda_events(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda_reminders (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  event_id varchar REFERENCES agenda_events(id),
  task_id varchar REFERENCES agenda_tasks(id),
  remind_at timestamp NOT NULL,
  channel agenda_reminder_channel NOT NULL DEFAULT 'push',
  status agenda_reminder_status NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda_task_plans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  task_id varchar NOT NULL REFERENCES agenda_tasks(id),
  start_at timestamp NOT NULL,
  end_at timestamp NOT NULL,
  status task_plan_status NOT NULL DEFAULT 'planned',
  generated_by task_plan_generated_by NOT NULL DEFAULT 'planner',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_availability (
  user_id varchar PRIMARY KEY REFERENCES users(id),
  timezone text NOT NULL DEFAULT 'UTC',
  work_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  work_start_time text NOT NULL DEFAULT '09:00',
  work_end_time text NOT NULL DEFAULT '18:00',
  buffer_minutes integer NOT NULL DEFAULT 10,
  min_block_minutes integer NOT NULL DEFAULT 15,
  do_not_disturb_windows jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_events_user_date_idx ON agenda_events(user_id, date);
CREATE INDEX IF NOT EXISTS agenda_events_source_idx ON agenda_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS agenda_tasks_user_status_idx ON agenda_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS agenda_task_plans_user_time_idx ON agenda_task_plans(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS agenda_reminders_due_idx ON agenda_reminders(status, remind_at);
