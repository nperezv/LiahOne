import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { activities, activityChecklistItems } from "@shared/schema";

/**
 * Finds the activity linked to a baptism service and auto-syncs the
 * entrevista_bautismal checklist item based on whether ALL candidates
 * have fecha_cumplido set in mission_compromiso_bautismo.
 * Stores candidate names + dates as JSON in the notes field.
 */
export async function syncBaptismInterviewChecklistItem(baptismServiceId: string): Promise<void> {
  try {
    // Find the linked activity
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.baptismServiceId, baptismServiceId))
      .limit(1);
    if (!activity) return;

    // Find the interview checklist item
    const [interviewItem] = await db
      .select()
      .from(activityChecklistItems)
      .where(
        and(
          eq(activityChecklistItems.activityId, activity.id),
          eq(activityChecklistItems.itemKey, "entrevista_bautismal"),
        ),
      )
      .limit(1);
    if (!interviewItem) return;

    // Get all candidates from baptism_service_candidates
    const candidatesRow = await db.execute(
      sql`SELECT bsc.persona_id, mp.nombre, mcb.fecha_invitado, mcb.fecha_cumplido
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          LEFT JOIN mission_compromiso_bautismo mcb
            ON mcb.persona_id = bsc.persona_id AND mcb.commitment_key = 'entrevista_bautismo'
          WHERE bsc.service_id = ${baptismServiceId}`,
    );
    let candidates = (candidatesRow.rows as Array<{
      persona_id: string;
      nombre: string;
      fecha_invitado: string | null;
      fecha_cumplido: string | null;
    }>);

    // Fallback: use candidate_persona_id for older records
    if (candidates.length === 0) {
      const serviceRow = await db.execute(
        sql`SELECT candidate_persona_id FROM baptism_services WHERE id = ${baptismServiceId} LIMIT 1`,
      );
      const personaId = (serviceRow.rows[0] as any)?.candidate_persona_id;
      if (!personaId) return;
      const personaRow = await db.execute(
        sql`SELECT mp.nombre, mcb.fecha_invitado, mcb.fecha_cumplido
            FROM mission_personas mp
            LEFT JOIN mission_compromiso_bautismo mcb
              ON mcb.persona_id = mp.id AND mcb.commitment_key = 'entrevista_bautismo'
            WHERE mp.id = ${personaId} LIMIT 1`,
      );
      if (personaRow.rows[0]) {
        const r = personaRow.rows[0] as any;
        candidates = [{ persona_id: personaId, nombre: r.nombre, fecha_invitado: r.fecha_invitado ?? null, fecha_cumplido: r.fecha_cumplido ?? null }];
      }
    }

    if (candidates.length === 0) return;

    const interviewDone = candidates.every((c) => !!c.fecha_cumplido);
    const notesJson = JSON.stringify(
      candidates.map((c) => ({
        persona_id: c.persona_id,
        nombre: c.nombre,
        fecha_invitado: c.fecha_invitado ?? null,
        fecha: c.fecha_cumplido ?? null,
      })),
    );

    // Update if state or notes differ
    const notesChanged = interviewItem.notes !== notesJson;
    if (interviewItem.completed !== interviewDone || notesChanged) {
      await db
        .update(activityChecklistItems)
        .set({
          completed: interviewDone,
          completedAt: interviewDone ? new Date() : null,
          notes: notesJson,
        })
        .where(eq(activityChecklistItems.id, interviewItem.id));
    }
  } catch (err) {
    console.error("[syncBaptismInterviewChecklistItem]", err);
  }
}
