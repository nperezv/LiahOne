const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://liahone:ireyh%40re@localhost:5432/liahone_db";

const client = new Client({ connectionString: DATABASE_URL });

client.connect().then(() => {
  return client.query(`
    ALTER TABLE budget_requests
      ADD COLUMN IF NOT EXISTS applicant_signature_data_url TEXT,
      ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'pago_adelantado',
      ADD COLUMN IF NOT EXISTS budget_categories_json JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS bank_data JSONB
  `);
}).then(() => {
  console.log("Migration OK: columnas añadidas a budget_requests");
  return client.end();
}).catch((e) => {
  console.error("Error:", e.message);
  client.end();
  process.exit(1);
});
