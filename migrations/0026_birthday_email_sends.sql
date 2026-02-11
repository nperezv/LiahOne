CREATE TABLE IF NOT EXISTS "birthday_email_sends" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "birthday_id" varchar NOT NULL REFERENCES "birthdays"("id") ON DELETE CASCADE,
  "day_key" text NOT NULL,
  "recipient_email" text NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "birthday_email_sends_birthday_day_key_idx"
  ON "birthday_email_sends" ("birthday_id", "day_key");
