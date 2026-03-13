-- Reestructuración del consejo de barrio según Manual General §29.2.5
-- Las 4 áreas de la obra de salvación y exaltación

ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS living_gospel_notes text;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS care_for_others_notes text;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS missionary_notes text;
ALTER TABLE ward_councils ADD COLUMN IF NOT EXISTS family_history_notes text;

-- Los campos anteriores (ministry_notes, salvation_work_notes, ward_activities_notes,
-- new_assignments_notes, agreements, agenda, adjustments_notes, opening_hymn,
-- spiritual_thought_topic) se conservan en BD para no perder datos históricos,
-- pero ya no se usan en la interfaz.
