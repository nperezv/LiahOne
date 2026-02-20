ALTER TYPE public.budget_status ADD VALUE IF NOT EXISTS 'aprobado_financiero';
ALTER TYPE public.budget_status ADD VALUE IF NOT EXISTS 'pendiente_firma_obispo';

ALTER TABLE public.budget_requests
  ADD COLUMN IF NOT EXISTS activity_date timestamp,
  ADD COLUMN IF NOT EXISTS financial_approved_by varchar REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS financial_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS bishop_approved_by varchar REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS bishop_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS bishop_signature_data_url text,
  ADD COLUMN IF NOT EXISTS bishop_signature_ip text,
  ADD COLUMN IF NOT EXISTS bishop_signature_user_agent text,
  ADD COLUMN IF NOT EXISTS bishop_signed_plan_filename text,
  ADD COLUMN IF NOT EXISTS bishop_signed_plan_url text;

CREATE TABLE IF NOT EXISTS public.budget_unlock_exceptions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES public.users(id),
  reason text NOT NULL,
  granted_by varchar NOT NULL REFERENCES public.users(id),
  expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
