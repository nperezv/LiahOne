-- Add marital status to members for JAS/AS assignment rules
CREATE TYPE marital_status AS ENUM ('soltero', 'casado', 'divorciado', 'viudo');

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS marital_status marital_status;
