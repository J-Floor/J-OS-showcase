import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";

import { liveTokens } from "./confirmToken.ts";

/** The event exists and has not ended. Hard stop, no grace. */
export function eventLive(
	event: Doc<"events"> | null,
	now: number
): event is Doc<"events"> {
	return event !== null && now <= event.endsAt;
}

/** Whether `(personId, eventId)` already has an attendance row: one
 *  `by_person_event` probe, never a read of the person's whole set. */
export async function hasAttendance(
	db: DatabaseReader,
	personId: Id<"people">,
	eventId: Id<"events">
): Promise<boolean> {
	const row = await db
		.query("eventAttendance")
		.withIndex("by_person_event", (q) =>
			q.eq("personId", personId).eq("eventId", eventId)
		)
		.first();
	return row !== null;
}

/**
 * Insert an `eventAttendance` row for `(personId, eventId)` unless the event
 * is gone or an identical row already exists.
 *
 * - The confirm link can outlive the event (events.deleteEvent may run
 *   between registration and this click). No event → no orphan attendance.
 * - Dedup: a person may confirm the same event twice (re-register →
 *   confirm), so an existing (person, event) row is left alone.
 *
 * Shared by every confirm flow (`settlePendingEvent` below, `visitors.ts`,
 * `eventCheckIn.ts`, `applications.ts`) so none of those modules has to import
 * another for it.
 */
export async function insertAttendanceOnce(
	ctx: MutationCtx,
	personId: Id<"people">,
	eventId: Id<"events">
): Promise<void> {
	const event = await ctx.db.get(eventId);
	if (event === null) return;
	if (await hasAttendance(ctx.db, personId, eventId)) return;
	await ctx.db.insert("eventAttendance", {
		personId,
		eventId,
		confirmedAt: Date.now(),
	});
}

/**
 * Turn every still-pending event registration into attendance. The pending
 * event lives on the live visitor-purpose token; a person who confirms by
 * another route (applying) would otherwise lose the visit.
 */
export async function settlePendingEvent(
	ctx: MutationCtx,
	personId: Id<"people">
): Promise<void> {
	const now = Date.now();
	for (const row of await liveTokens(ctx.db, personId, "visitor", now)) {
		await ctx.db.patch(row._id, { consumedAt: now });
		if (row.eventId) await insertAttendanceOnce(ctx, personId, row.eventId);
	}
}
