-- Backfill legacy archived interviews created by previous flow.
-- Product decision: preserve semantic tag in archived view (prefer "completada" over "archivada").

UPDATE interviews
SET
  status = 'completada',
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Ajuste automático: estado archivada migrado a completada.'
    WHEN notes LIKE '%Ajuste automático: estado archivada migrado a completada.%' THEN notes
    ELSE notes || E'\nAjuste automático: estado archivada migrado a completada.'
  END,
  updated_at = NOW()
WHERE status = 'archivada';

UPDATE organization_interviews
SET
  status = 'completada',
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Ajuste automático: estado archivada migrado a completada.'
    WHEN notes LIKE '%Ajuste automático: estado archivada migrado a completada.%' THEN notes
    ELSE notes || E'\nAjuste automático: estado archivada migrado a completada.'
  END,
  updated_at = NOW()
WHERE status = 'archivada';
