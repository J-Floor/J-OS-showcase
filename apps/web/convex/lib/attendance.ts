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
	database: DatabaseReader,
	personId: Id<"people">,
	eventId: Id<"events">
): Promise<boolean> {
	const row = await database
		.query("eventAttendance")
		.withIndex("by_person_event", (range) =>
			range.eq("personId", personId).eq("eventId", eventId)
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
	context: MutationCtx,
	personId: Id<"people">,
	eventId: Id<"events">
): Promise<void> {
	const event = await context.db.get(eventId);
	if (event === null || (await hasAttendance(context.db, personId, eventId)))
		return;
	await context.db.insert("eventAttendance", {
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
	context: MutationCtx,
	personId: Id<"people">
): Promise<void> {
	const now = Date.now();
	const rows = await liveTokens(context.db, personId, "visitor", now);
	for (const row of rows) {
		await context.db.patch(row._id, { consumedAt: now });
		if (row.eventId)
			await insertAttendanceOnce(context, personId, row.eventId);
	}
}
