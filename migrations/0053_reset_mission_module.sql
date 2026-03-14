-- ============================================================
-- 0053_reset_mission_module.sql
-- Limpia completamente el módulo de obra misional para
-- rediseñarlo desde cero.
-- IRREVERSIBLE — ejecutar solo en entorno confirmado.
-- ============================================================

-- 1. Tablas de bautismo (dependen de mission_contacts y entre sí)
DROP TABLE IF EXISTS "baptism_notification_deliveries" CASCADE;
DROP TABLE IF EXISTS "baptism_public_posts" CASCADE;
DROP TABLE IF EXISTS "baptism_public_links" CASCADE;
DROP TABLE IF EXISTS "baptism_assignments" CASCADE;
DROP TABLE IF EXISTS "baptism_program_items" CASCADE;
DROP TABLE IF EXISTS "baptism_services" CASCADE;

-- 2. Tablas de progreso y seguimiento (dependen de mission_contacts)
DROP TABLE IF EXISTS "mission_friend_section_data" CASCADE;
DROP TABLE IF EXISTS "mission_covenant_path_progress" CASCADE;
DROP TABLE IF EXISTS "mission_church_attendance" CASCADE;
DROP TABLE IF EXISTS "mission_coordination_tasks" CASCADE;
DROP TABLE IF EXISTS "mission_contact_milestones" CASCADE;
DROP TABLE IF EXISTS "mission_contact_commitments" CASCADE;
DROP TABLE IF EXISTS "mission_contact_lessons" CASCADE;

-- 3. Plantillas (dependen de mission_track_templates)
DROP TABLE IF EXISTS "mission_template_items" CASCADE;
DROP TABLE IF EXISTS "mission_track_templates" CASCADE;

-- 4. Tablas base de contactos
DROP TABLE IF EXISTS "mission_contact_notes" CASCADE;
DROP TABLE IF EXISTS "mission_contact_assignees" CASCADE;
DROP TABLE IF EXISTS "mission_contacts" CASCADE;

-- 5. ENUMs del módulo misional
DROP TYPE IF EXISTS "mission_person_type" CASCADE;
DROP TYPE IF EXISTS "mission_assignee_role" CASCADE;
DROP TYPE IF EXISTS "mission_item_type" CASCADE;
DROP TYPE IF EXISTS "mission_lesson_status" CASCADE;
DROP TYPE IF EXISTS "mission_commitment_result" CASCADE;
DROP TYPE IF EXISTS "mission_milestone_status" CASCADE;
DROP TYPE IF EXISTS "mission_task_priority" CASCADE;
DROP TYPE IF EXISTS "mission_task_status" CASCADE;

-- 6. ENUMs del módulo de bautismos
DROP TYPE IF EXISTS "baptism_service_status" CASCADE;
DROP TYPE IF EXISTS "baptism_program_item_type" CASCADE;
DROP TYPE IF EXISTS "baptism_assignment_type" CASCADE;
DROP TYPE IF EXISTS "baptism_assignment_status" CASCADE;
DROP TYPE IF EXISTS "baptism_public_post_status" CASCADE;
DROP TYPE IF EXISTS "baptism_approval_status" CASCADE;

-- Nota: Los roles mission_leader, ward_missionary, full_time_missionary
-- se mantienen en el enum "role" (Postgres no permite eliminar valores de enum).
-- Nota: Las columnas hymnbook, lang, external_url de la tabla hymns se mantienen.
