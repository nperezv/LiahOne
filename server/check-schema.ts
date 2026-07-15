import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { getTableColumns, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

async function run() {
  // Get all columns from database
  const result = await db.execute(sql`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  
  const dbColumns = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const table = row.table_name as string;
    if (!dbColumns.has(table)) dbColumns.set(table, new Set());
    dbColumns.get(table)!.add(row.column_name as string);
  }

  // Get all Drizzle tables from schema
  const tables: [string, PgTable][] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === "object" && Symbol.for("drizzle:Name") in (value as any)) {
      try {
        const name = getTableName(value as any);
        tables.push([name, value as any]);
      } catch {}
    }
  }

  console.log(`Found ${tables.length} Drizzle tables in schema`);
  console.log(`Found ${dbColumns.size} tables in database\n`);

  const missingColumns: { table: string; column: string }[] = [];
  const missingTables: string[] = [];

  for (const [tableName, table] of tables) {
    if (!dbColumns.has(tableName)) {
      missingTables.push(tableName);
      continue;
    }
    const dbCols = dbColumns.get(tableName)!;
    const schemaCols = getTableColumns(table);
    for (const [_key, col] of Object.entries(schemaCols)) {
      const colName = (col as any).name;
      if (!dbCols.has(colName)) {
        missingColumns.push({ table: tableName, column: colName });
      }
    }
  }

  if (missingTables.length > 0) {
    console.log("MISSING TABLES:");
    for (const t of missingTables) console.log(`  - ${t}`);
  }

  if (missingColumns.length > 0) {
    console.log("\nMISSING COLUMNS:");
    for (const mc of missingColumns) {
      console.log(`  - ${mc.table}.${mc.column}`);
    }
  }

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log("ALL TABLES AND COLUMNS ARE IN SYNC!");
  }

  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
