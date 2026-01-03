-- migrations/0008_budget_amounts_numeric.sql

ALTER TABLE ward_budgets
  ALTER COLUMN amount TYPE numeric(12, 2) USING amount::numeric,
  ALTER COLUMN annual_amount TYPE numeric(12, 2) USING annual_amount::numeric,
  ALTER COLUMN q1_amount TYPE numeric(12, 2) USING q1_amount::numeric,
  ALTER COLUMN q2_amount TYPE numeric(12, 2) USING q2_amount::numeric,
  ALTER COLUMN q3_amount TYPE numeric(12, 2) USING q3_amount::numeric,
  ALTER COLUMN q4_amount TYPE numeric(12, 2) USING q4_amount::numeric;

ALTER TABLE organization_budgets
  ALTER COLUMN amount TYPE numeric(12, 2) USING amount::numeric;
