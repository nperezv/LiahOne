CREATE TYPE "access_request_status" AS ENUM ('pendiente', 'aprobada', 'rechazada');

CREATE TABLE "access_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "calling" text,
  "phone" text,
  "contact_consent" boolean NOT NULL DEFAULT false,
  "status" "access_request_status" NOT NULL DEFAULT 'pendiente',
  "created_at" timestamp NOT NULL DEFAULT now()
);
