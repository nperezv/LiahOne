DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'organization_type' AND e.enumlabel = 'as'
  ) THEN
    ALTER TYPE organization_type ADD VALUE 'as';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_organization_membership_type') THEN
    CREATE TYPE member_organization_membership_type AS ENUM ('primary', 'derived_rule', 'manual');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS member_organizations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id varchar NOT NULL REFERENCES members(id),
  organization_id varchar NOT NULL REFERENCES organizations(id),
  membership_type member_organization_membership_type NOT NULL DEFAULT 'manual',
  source_rule text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS member_organizations_member_org_active_uidx
  ON member_organizations(member_id, organization_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS member_organizations_org_active_idx
  ON member_organizations(organization_id, is_active);

INSERT INTO organizations (type, name)
SELECT 'as', 'AS'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE type = 'as');

INSERT INTO organizations (type, name)
SELECT 'jas', 'JAS'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE type = 'jas');

INSERT INTO member_organizations (member_id, organization_id, membership_type, source_rule, is_active)
SELECT m.id, m.organization_id, 'primary', NULL, true
FROM members m
WHERE m.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

WITH organization_ids AS (
  SELECT
    MAX(CASE WHEN type = 'escuela_dominical' THEN id END) AS escuela_dominical_id,
    MAX(CASE WHEN type = 'jas' THEN id END) AS jas_id,
    MAX(CASE WHEN type = 'as' THEN id END) AS as_id
  FROM organizations
), member_ages AS (
  SELECT m.id AS member_id,
         EXTRACT(YEAR FROM age(current_date, m.birthday::date))::int AS age
  FROM members m
)
INSERT INTO member_organizations (member_id, organization_id, membership_type, source_rule, is_active)
SELECT ma.member_id, oi.escuela_dominical_id, 'derived_rule', 'edad_12_plus', true
FROM member_ages ma
CROSS JOIN organization_ids oi
WHERE ma.age >= 12 AND oi.escuela_dominical_id IS NOT NULL
ON CONFLICT DO NOTHING;

WITH organization_ids AS (
  SELECT MAX(CASE WHEN type = 'jas' THEN id END) AS jas_id FROM organizations
), member_ages AS (
  SELECT m.id AS member_id,
         EXTRACT(YEAR FROM age(current_date, m.birthday::date))::int AS age
  FROM members m
)
INSERT INTO member_organizations (member_id, organization_id, membership_type, source_rule, is_active)
SELECT ma.member_id, oi.jas_id, 'derived_rule', 'jas_18_35', true
FROM member_ages ma
CROSS JOIN organization_ids oi
WHERE ma.age BETWEEN 18 AND 35 AND oi.jas_id IS NOT NULL
ON CONFLICT DO NOTHING;

WITH organization_ids AS (
  SELECT MAX(CASE WHEN type = 'as' THEN id END) AS as_id FROM organizations
), member_ages AS (
  SELECT m.id AS member_id,
         EXTRACT(YEAR FROM age(current_date, m.birthday::date))::int AS age
  FROM members m
)
INSERT INTO member_organizations (member_id, organization_id, membership_type, source_rule, is_active)
SELECT ma.member_id, oi.as_id, 'derived_rule', 'as_36_100', true
FROM member_ages ma
CROSS JOIN organization_ids oi
WHERE ma.age BETWEEN 36 AND 100 AND oi.as_id IS NOT NULL
ON CONFLICT DO NOTHING;
