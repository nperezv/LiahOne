-- Junction table: multiple candidates per baptism service
CREATE TABLE IF NOT EXISTS "baptism_service_candidates" (
  "service_id" varchar NOT NULL REFERENCES "baptism_services"("id") ON DELETE CASCADE,
  "persona_id" varchar NOT NULL REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  PRIMARY KEY ("service_id", "persona_id")
);

-- Migrate existing one-to-one data into junction table
INSERT INTO baptism_service_candidates (service_id, persona_id)
SELECT id, candidate_persona_id
FROM baptism_services
WHERE candidate_persona_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Merge duplicate services that share the same date + unit (keep earliest, re-point candidates)
DO $$
DECLARE
  dup RECORD;
  keep_id varchar;
  dup_id varchar;
BEGIN
  FOR dup IN
    SELECT unit_id, DATE(service_at) AS svc_date
    FROM baptism_services
    WHERE status != 'archived'
    GROUP BY unit_id, DATE(service_at)
    HAVING COUNT(*) > 1
  LOOP
    -- Get the oldest service to keep
    SELECT id INTO keep_id
    FROM baptism_services
    WHERE unit_id = dup.unit_id AND DATE(service_at) = dup.svc_date AND status != 'archived'
    ORDER BY created_at ASC
    LIMIT 1;

    -- For each duplicate (not the keeper), move candidates to keeper then delete duplicate
    FOR dup_id IN
      SELECT id FROM baptism_services
      WHERE unit_id = dup.unit_id AND DATE(service_at) = dup.svc_date AND status != 'archived'
        AND id != keep_id
    LOOP
      -- Move candidates
      INSERT INTO baptism_service_candidates (service_id, persona_id)
      SELECT keep_id, persona_id FROM baptism_service_candidates WHERE service_id = dup_id
      ON CONFLICT DO NOTHING;
      -- Delete the duplicate service (cascades candidates, program_items, assignments, etc.)
      DELETE FROM baptism_services WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Update activity titles to reflect all candidates for merged services
UPDATE activities a
SET title = (
  SELECT 'Servicio bautismal: ' || string_agg(mp.nombre, ', ' ORDER BY mp.nombre)
  FROM baptism_service_candidates bsc
  JOIN mission_personas mp ON mp.id = bsc.persona_id
  WHERE bsc.service_id = a.baptism_service_id
)
WHERE a.type = 'servicio_bautismal'
  AND a.baptism_service_id IS NOT NULL
  AND (SELECT COUNT(*) FROM baptism_service_candidates WHERE service_id = a.baptism_service_id) > 1;
