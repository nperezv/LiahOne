-- Interview availability windows per leader (bishop / counselors)
CREATE TABLE IF NOT EXISTS interview_windows (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,   -- 0=Mon … 6=Sun
  start_time text NOT NULL,       -- "18:00"
  end_time text NOT NULL,         -- "20:00"
  slot_minutes integer NOT NULL DEFAULT 30,
  max_per_day integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now() NOT NULL
);

-- Interview requests submitted via Chio chatbot
CREATE TABLE IF NOT EXISTS interview_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  apellidos text NOT NULL,
  email text NOT NULL,
  telefono text DEFAULT '',
  asunto text NOT NULL,
  notas text DEFAULT '',
  leader_role text NOT NULL,       -- 'obispo' | 'consejero_1' | 'consejero_2'
  preferred_date text DEFAULT '',  -- 'YYYY-MM-DD' chosen by user in Chio
  preferred_time text DEFAULT '',  -- 'HH:MM' chosen by user in Chio
  status text NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled | rejected
  created_at timestamp DEFAULT now() NOT NULL
);
