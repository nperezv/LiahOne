import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { activities, activityChecklistItems } from "@shared/schema";

/**
 * Finds the activity linked to a baptism service and auto-syncs the
 * visibilidad_evento checklist item based on whether visibility_confirmed
 * has been explicitly set in baptism_services.
 * Creates the checklist item if it doesn't exist (backfill for older services).
 */
export async function syncBaptismVisibilityChecklistItem(baptismServiceId: string): Promise<void> {
  try {
    // Find the linked activity
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.baptismServiceId, baptismServiceId))
      .limit(1);
    if (!activity) return;

    // Check visibility_confirmed from baptism_services
    const serviceRow = await db.execute(
      sql`SELECT visibility_confirmed FROM baptism_services WHERE id = ${baptismServiceId} LIMIT 1`,
    );
    const visibilityConfirmed = !!(serviceRow.rows[0] as any)?.visibility_confirmed;

    // Find or create the visibilidad_evento checklist item
    const [existingItem] = await db
      .select()
      .from(activityChecklistItems)
      .where(
        and(
          eq(activityChecklistItems.activityId, activity.id),
          eq(activityChecklistItems.itemKey, "visibilidad_evento"),
        ),
      )
      .limit(1);

    if (!existingItem) {
      // Backfill: create the item for older services that predate this checklist item
      await db.insert(activityChecklistItems).values({
        activityId: activity.id,
        itemKey: "visibilidad_evento",
        label: "Visibilidad del evento definida (público o privado)",
        sortOrder: 8,
        completed: visibilityConfirmed,
        completedAt: visibilityConfirmed ? new Date() : null,
      });
      return;
    }

    // Update if state differs
    if (existingItem.completed !== visibilityConfirmed) {
      await db
        .update(activityChecklistItems)
        .set({
          completed: visibilityConfirmed,
          completedAt: visibilityConfirmed ? new Date() : null,
        })
        .where(eq(activityChecklistItems.id, existingItem.id));
    }
  } catch (err) {
    console.error("[syncBaptismVisibilityChecklistItem]", err);
  }
}
