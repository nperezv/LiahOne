-- Agenda: las entrevistas de organización también aparecen en la agenda de quien las hace.
-- (Se aplica también automáticamente al arrancar: server/startup-agenda-migrations.ts)
ALTER TYPE agenda_event_source ADD VALUE IF NOT EXISTS 'organization_interview';
