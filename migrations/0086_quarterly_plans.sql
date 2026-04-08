-- Quarterly plans: organization-level activity planning with approval flow

CREATE TABLE IF NOT EXISTS quarterly_plans (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  varchar REFERENCES organizations(id) ON DELETE CASCADE,
  quarter          integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year             integer NOT NULL,
  status           text NOT NULL DEFAULT 'draft',
  -- status: draft | submitted | approved | rejected
  submitted_at     timestamp with time zone,
  submitted_by     varchar REFERENCES users(id),
  reviewed_at      timestamp with time zone,
  reviewed_by      varchar REFERENCES users(id),
  review_comment   text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now()
);

-- One plan per org per quarter/year (organization_id NULL = barrio/ward plan)
-- PG13 compatible: separate indexes for NULL and non-NULL cases
CREATE UNIQUE INDEX IF NOT EXISTS quarterly_plans_org_quarter_year_idx
  ON quarterly_plans (organization_id, quarter, year)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quarterly_plans_barrio_quarter_year_idx
  ON quarterly_plans (quarter, year)
  WHERE organization_id IS NULL;

CREATE TABLE IF NOT EXISTS quarterly_plan_items (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quarterly_plan_id   varchar NOT NULL REFERENCES quarterly_plans(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  activity_date       date NOT NULL,
  location            text,
  estimated_attendance integer,
  budget              numeric(10,2),
  notes               text,
  "order"             integer NOT NULL DEFAULT 0,
  -- linked activity once approved and executed
  activity_id         varchar REFERENCES activities(id),
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now()
);

-- Link service_tasks to a quarterly plan item (pre-activity logistics tasks)
ALTER TABLE service_tasks
  ADD COLUMN IF NOT EXISTS quarterly_plan_item_id varchar REFERENCES quarterly_plan_items(id) ON DELETE SET NULL;
