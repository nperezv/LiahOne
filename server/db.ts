// Database connection configuration
// Supports both Neon (serverless) and standard PostgreSQL

import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool, types as pgTypes } from 'pg';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

// Parse TIMESTAMP WITHOUT TIME ZONE as UTC wall-clock time.
// Without this, node-postgres treats naive timestamp strings as server-local time,
// which causes a 2-hour offset when the server runs in UTC+2 (Europe/Madrid).
// @neondatabase/serverless re-exports `types` from `pg`, so one call covers both drivers.
pgTypes.setTypeParser(1114, (val: string) => new Date(val + "Z"));

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if running on Replit (uses Neon serverless) or locally (uses standard pg)
const isReplit = !!process.env.REPL_ID;

let pool: NeonPool | PgPool;
let db: ReturnType<typeof drizzleNeon> | ReturnType<typeof drizzlePg>;

if (isReplit) {
  // Use Neon serverless driver for Replit environment
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzleNeon({ client: pool as NeonPool, schema });
} else {
  // Use standard pg driver for local PostgreSQL
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool as PgPool, schema });
}

export { pool, db };
