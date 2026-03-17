-- For each baptism service, keep exactly one linked activity and delete the rest.
-- Strategy:
--   1. For each service, find or assign the "keeper" activity
--      (prefer the one already linked via baptism_service_id, else the earliest by created_at)
--   2. Re-link the keeper to the service (in case it was orphaned)
--   3. Delete the other servicio_bautismal activities for the same date + org
--   4. Update the keeper's title to list all current candidates

DO $$
DECLARE
  svc RECORD;
  keeper_id varchar;
BEGIN
  FOR svc IN
    SELECT bs.id AS service_id,
           bs.unit_id,
           DATE(bs.service_at) AS svc_date
    FROM baptism_services bs
    WHERE bs.status != 'archived'
  LOOP
    -- Find the activity already linked to this service
    SELECT id INTO keeper_id
    FROM activities
    WHERE baptism_service_id = svc.service_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- If none linked, find an orphaned servicio_bautismal activity on the same date + org
    IF keeper_id IS NULL THEN
      SELECT id INTO keeper_id
      FROM activities
      WHERE type = 'servicio_bautismal'
        AND organization_id = svc.unit_id
        AND DATE(date) = svc.svc_date
        AND (baptism_service_id IS NULL OR baptism_service_id = svc.service_id)
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF keeper_id IS NULL THEN
      CONTINUE; -- no activity to manage for this service
    END IF;

    -- Ensure keeper is linked to this service
    UPDATE activities SET baptism_service_id = svc.service_id WHERE id = keeper_id;

    -- Delete all other servicio_bautismal activities for same date + org (not the keeper)
    DELETE FROM activities
    WHERE type = 'servicio_bautismal'
      AND organization_id = svc.unit_id
      AND DATE(date) = svc.svc_date
      AND id != keeper_id;

    -- Update keeper title to list all candidates
    UPDATE activities
    SET title = (
      SELECT 'Servicio bautismal: ' || string_agg(mp.nombre, ', ' ORDER BY mp.nombre)
      FROM baptism_service_candidates bsc
      JOIN mission_personas mp ON mp.id = bsc.persona_id
      WHERE bsc.service_id = svc.service_id
    )
    WHERE id = keeper_id;

  END LOOP;
END $$;
