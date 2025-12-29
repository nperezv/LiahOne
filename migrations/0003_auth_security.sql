ALTER TABLE "users" ADD COLUMN "require_email_otp" boolean DEFAULT false NOT NULL;

CREATE TABLE "user_devices" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users" ("id"),
  "device_hash" text NOT NULL,
  "label" text,
  "trusted" boolean NOT NULL DEFAULT false,
  "last_used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "refresh_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users" ("id"),
  "device_hash" text,
  "token_hash" text NOT NULL,
  "ip_address" text,
  "country" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "replaced_by_token_id" varchar
);

CREATE TABLE "login_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar REFERENCES "users" ("id"),
  "device_hash" text,
  "ip_address" text,
  "country" text,
  "user_agent" text,
  "success" boolean NOT NULL DEFAULT false,
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "email_otps" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users" ("id"),
  "code_hash" text NOT NULL,
  "device_hash" text,
  "ip_address" text,
  "country" text,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
