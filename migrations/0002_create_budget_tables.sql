-- migrations/0002_create_budget_tables.sql

-- Ward Budgets
CREATE TABLE ward_budgets (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    amount integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

-- Organization Budgets
CREATE TABLE organization_budgets (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    organization_id varchar NOT NULL REFERENCES organizations(id),
    amount integer NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);

