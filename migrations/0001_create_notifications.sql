-- 0001_create_notifications.sql

-- Crear enum notification_type si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM (
            'upcoming_interview',
            'birthday_today',
            'budget_approved',
            'budget_rejected',
            'assignment_created',
            'upcoming_meeting',
            'reminder'
        );
    END IF;
END$$;

-- Crear tabla notifications
CREATE TABLE IF NOT EXISTS notifications (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    user_id varchar NOT NULL REFERENCES users(id),
    type notification_type NOT NULL,
    title text NOT NULL,
    description text,
    related_id varchar,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
);

