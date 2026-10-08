/**
 * Reparaciones idempotentes de la agenda. Se ejecutan al arrancar el servidor.
 * - agenda_event_source: nuevo origen "organization_interview" para las entrevistas de organización.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

export async function applyAgendaStartupMigrations() {
  try {
    // ADD VALUE no puede ir dentro de una transacción: se ejecuta como sentencia suelta.
    await db.execute(sql`ALTER TYPE agenda_event_source ADD VALUE IF NOT EXISTS 'organization_interview'`);
    console.log("[agenda-startup-migration] tipos de la agenda revisados");
  } catch (error) {
    console.error("[agenda-startup-migration] falló:", error);
  }
}
