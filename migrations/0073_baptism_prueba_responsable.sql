-- Add prueba_responsable to baptism_service_baptism_details
ALTER TABLE baptism_service_baptism_details
  ADD COLUMN IF NOT EXISTS prueba_responsable text;

-- Rename ropa_bautismal checklist label for existing activities
UPDATE activity_checklist_items
SET label = 'Ropa bautismal coordinada'
WHERE item_key = 'ropa_bautismal';
