/**
 * Reparaciones idempotentes de las tablas de inventario. Se ejecutan al arrancar el servidor
 * y se pueden repetir sin peligro.
 *
 * Contexto: la migración 0037 creó columnas con nombres antiguos y la 0038 añadió las nuevas
 * sin retirar las viejas. Por eso la base de datos real no coincide con shared/schema.ts:
 *  - inventory_items.qr_code_url seguía siendo NOT NULL → al crear un activo:
 *    "null value in column qr_code_url violates not-null constraint".
 *  - inventory_movements tenía la columna "timestamp", pero el código usa created_at
 *    → el historial y los movimientos fallaban.
 *  - inventory_locations.name era UNIQUE → no se podían tener dos "Estante 1" en armarios distintos.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

async function columnExists(table: string, column: string) {
  const result: any = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `);
  const rows = "rows" in result ? result.rows : result;
  return Array.isArray(rows) && rows.length > 0;
}

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    // Nunca bloquear el arranque por una reparación; solo dejar constancia.
    console.error(`[inventory-startup-migration] ${name} falló:`, error);
  }
}

export async function applyInventoryStartupMigrations() {
  if (!(await columnExists("inventory_items", "id"))) return; // módulo de inventario no instalado

  // 1. Columna antigua qr_code_url: rellenarla y quitarle la obligatoriedad.
  await step("qr_code_url", async () => {
    if (!(await columnExists("inventory_items", "qr_code_url"))) return;
    await db.execute(sql`UPDATE inventory_items SET qr_code_url = qr_url WHERE qr_code_url IS NULL AND qr_url IS NOT NULL`);
    await db.execute(sql`ALTER TABLE inventory_items ALTER COLUMN qr_code_url DROP NOT NULL`);
  });

  // 2. Columna antigua nfc_uid (ahora se usa la tabla inventory_nfc_links): que no estorbe.
  await step("nfc_uid", async () => {
    if (!(await columnExists("inventory_items", "nfc_uid"))) return;
    await db.execute(sql`ALTER TABLE inventory_items ALTER COLUMN nfc_uid DROP NOT NULL`);
  });

  // 3. Historial de movimientos: el código usa created_at.
  await step("inventory_movements.created_at", async () => {
    if (await columnExists("inventory_movements", "created_at")) return;
    await db.execute(sql`ALTER TABLE inventory_movements ADD COLUMN created_at timestamp NOT NULL DEFAULT now()`);
    if (await columnExists("inventory_movements", "timestamp")) {
      await db.execute(sql`UPDATE inventory_movements SET created_at = "timestamp" WHERE "timestamp" IS NOT NULL`);
    }
  });

  // 4. Permitir nombres repetidos de ubicación (p. ej. "Estante 1" en varios armarios).
  //    El código de cada ubicación sigue siendo único.
  await step("inventory_locations name unique", async () => {
    await db.execute(sql`ALTER TABLE inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_name_key`);
    await db.execute(sql`ALTER TABLE inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_name_unique`);
  });

  // 5. Los códigos de activo nuevos pueden ser más largos que los 30 caracteres de la tabla original.
  await step("asset_code length", async () => {
    await db.execute(sql`ALTER TABLE inventory_items ALTER COLUMN asset_code TYPE varchar(40)`);
  });

  // 6. Nuevas funciones: cantidades, dar de baja, préstamos a miembros, avisos de vencidos,
  //    revisión de armarios.
  await step("enum retired", async () => {
    // ADD VALUE no puede ir dentro de una transacción: se ejecuta como sentencia suelta.
    await db.execute(sql`ALTER TYPE inventory_item_status ADD VALUE IF NOT EXISTS 'retired'`);
  });
  await step("items quantity/retired", async () => {
    await db.execute(sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS retired_at timestamp`);
    await db.execute(sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS retired_reason text`);
  });
  await step("loans quantity/member/overdue", async () => {
    await db.execute(sql`ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1`);
    await db.execute(sql`ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS member_id varchar`);
    await db.execute(sql`ALTER TABLE inventory_loans ADD COLUMN IF NOT EXISTS overdue_notified_at timestamp`);
  });
  await step("locations last_checked_at", async () => {
    await db.execute(sql`ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS last_checked_at timestamp`);
  });

  console.log("[inventory-startup-migration] tablas de inventario revisadas");
}
