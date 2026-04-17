-- Create a solo family (cabeza_familia) for every member not yet in any family
WITH members_needing_family AS (
  SELECT id AS member_id
  FROM members
  WHERE NOT EXISTS (
    SELECT 1 FROM family_members fm WHERE fm.member_id = members.id
  )
),
inserted_families AS (
  INSERT INTO families (id, created_at)
  SELECT gen_random_uuid(), now()
  FROM members_needing_family
  RETURNING id
),
numbered_members AS (
  SELECT member_id, ROW_NUMBER() OVER () AS rn FROM members_needing_family
),
numbered_families AS (
  SELECT id AS family_id, ROW_NUMBER() OVER () AS rn FROM inserted_families
)
INSERT INTO family_members (id, family_id, member_id, role, created_at)
SELECT gen_random_uuid(), nf.family_id, nm.member_id, 'cabeza_familia', now()
FROM numbered_members nm
JOIN numbered_families nf ON nm.rn = nf.rn;
