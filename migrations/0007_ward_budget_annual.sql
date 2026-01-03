-- migrations/0007_ward_budget_annual.sql

ALTER TABLE ward_budgets
  ADD COLUMN annual_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN year integer NOT NULL DEFAULT EXTRACT(year from now()),
  ADD COLUMN q1_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN q2_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN q3_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN q4_amount integer NOT NULL DEFAULT 0;

UPDATE ward_budgets
SET annual_amount = amount
WHERE annual_amount = 0;
