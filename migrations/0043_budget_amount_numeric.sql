ALTER TABLE "budget_requests" ALTER COLUMN "amount" TYPE numeric(12,2) USING amount::numeric(12,2);
