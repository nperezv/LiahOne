-- Family units: link members as spouses, children, or head of household
CREATE TYPE family_role AS ENUM ('cabeza_familia', 'conyuge', 'hijo');

CREATE TABLE IF NOT EXISTS families (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,
  address     TEXT,
  phone       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS family_members (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   VARCHAR NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id   VARCHAR NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role        family_role NOT NULL DEFAULT 'hijo',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(member_id)  -- each member belongs to exactly one family
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_member_id ON family_members(member_id);
