-- Fix service_task titles that still show "Por confirmar" or old location_name
-- by replacing with actual candidate names from baptism_service_candidates
UPDATE service_tasks st
SET title = (
  SELECT 'Servicio Bautismal — Coordinación logística: ' ||
         STRING_AGG(mp.nombre, ' & ' ORDER BY bsc.created_at)
  FROM baptism_service_candidates bsc
  JOIN mission_personas mp ON mp.id = bsc.persona_id
  WHERE bsc.service_id = st.baptism_service_id
)
WHERE st.assigned_role = 'lider_actividades'
  AND (
    st.title LIKE '%Por confirmar%'
    OR st.title = 'Servicio Bautismal — Coordinación logística: '
  )
  AND st.baptism_service_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM baptism_service_candidates bsc2
    WHERE bsc2.service_id = st.baptism_service_id
  );

-- Also fix mission_leader_logistics tasks
UPDATE service_tasks st
SET title = (
  SELECT 'Coordinar logística con el lider de actividades: ' ||
         STRING_AGG(mp.nombre, ' & ' ORDER BY bsc.created_at)
  FROM baptism_service_candidates bsc
  JOIN mission_personas mp ON mp.id = bsc.persona_id
  WHERE bsc.service_id = st.baptism_service_id
)
WHERE st.assigned_role = 'mission_leader_logistics'
  AND (
    st.title LIKE '%Por confirmar%'
    OR st.title = 'Coordinar logística con el lider de actividades: '
  )
  AND st.baptism_service_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM baptism_service_candidates bsc2
    WHERE bsc2.service_id = st.baptism_service_id
  );
