ALTER TABLE user_availability
  ADD COLUMN IF NOT EXISTS reminder_channels text[] NOT NULL DEFAULT ARRAY['push'];

CREATE TABLE IF NOT EXISTS agenda_idempotency_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  key text NOT NULL,
  endpoint text NOT NULL,
  response_body jsonb,
  status_code integer,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agenda_idempotency_unique_idx
  ON agenda_idempotency_keys(user_id, key, endpoint);

CREATE TABLE IF NOT EXISTS agenda_command_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id),
  endpoint text NOT NULL,
  request_text text,
  intent text,
  confidence numeric(5,2),
  result_record_type text,
  result_record_id varchar,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_command_logs_user_created_idx
  ON agenda_command_logs(user_id, created_at DESC);
