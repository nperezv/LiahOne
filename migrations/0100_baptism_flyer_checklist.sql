-- Add prog_flyer checklist item to existing servicio_bautismal activities that don't have it yet
INSERT INTO activity_checklist_items (activity_id, item_key, label, sort_order, completed, completed_at)
SELECT
  a.id,
  'prog_flyer',
  'Flyer',
  9,
  false,
  NULL
FROM activities a
WHERE a.type = 'servicio_bautismal'
  AND NOT EXISTS (
    SELECT 1 FROM activity_checklist_items ci
    WHERE ci.activity_id = a.id AND ci.item_key = 'prog_flyer'
  );
