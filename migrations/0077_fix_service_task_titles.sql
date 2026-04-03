-- Fix service_task titles to use correct format:
-- "Servicio Bautismal <Nombre(s)> — Coordinación logística"
-- Note: Spanish name joining (", " and " y " before last) is handled by the
-- server startup fix in routes.ts which uses JavaScript for proper formatting.
-- This SQL handles the simple single-candidate case as a fallback.
UPDATE service_tasks st
SET title = (
  SELECT 'Servicio Bautismal ' ||
         STRING_AGG(mp.nombre, ' y ' ORDER BY mp.nombre) ||
         ' — Coordinación logística'
  FROM baptism_service_candidates bsc
  JOIN mission_personas mp ON mp.id = bsc.persona_id
  WHERE bsc.service_id = st.baptism_service_id
)
WHERE st.assigned_role = 'lider_actividades'
  AND st.baptism_service_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM baptism_service_candidates bsc2
    WHERE bsc2.service_id = st.baptism_service_id
  );

UPDATE service_tasks st
SET title = (
  SELECT 'Coordinar logística con el lider de actividades: ' ||
         STRING_AGG(mp.nombre, ' y ' ORDER BY mp.nombre)
  FROM baptism_service_candidates bsc
  JOIN mission_personas mp ON mp.id = bsc.persona_id
  WHERE bsc.service_id = st.baptism_service_id
)
WHERE st.assigned_role = 'mission_leader_logistics'
  AND st.baptism_service_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM baptism_service_candidates bsc2
    WHERE bsc2.service_id = st.baptism_service_id
  );
