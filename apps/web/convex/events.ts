import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { eventLive } from "./lib/attendance.ts";
import { requireRole } from "./lib/authGuard.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { SITE_TIMEZONE, utcFromLocal, zonedTimeZoneName } from "./lib/time.ts";
import { assertLen, NAME_MAX } from "./lib/validate.ts";
import { currentActorId } from "./lifecycle.ts";
import {
	cancelEventReminders,
	scheduleEventReminders,
} from "./notify/eventReminders.ts";

// Mirrors purge.ts's BATCH_SIZE rationale: a board could delete an event with
// far more attendance rows than fit one transaction's read/write limits, so
// the purge is a bounded, self-rescheduling batch rather than a single
// collect+delete.
const BATCH_SIZE = 200;

/** Reject a caller-supplied `*Local` whose embedded IXDTF zone is not the
 *  site's. A board caller could embed e.g. `[America/Los_Angeles]`; the table
 *  formats the cached epoch in Zurich while the drawer formats the stored
 *  zone, so they'd silently disagree. Reject at the mutation boundary
 *  instead. */
function assertSiteZone(local: string): void {
	if (zonedTimeZoneName(local) !== SITE_TIMEZONE)
		throw new Error(`Event times must be in ${SITE_TIMEZONE}.`);
}

export const createEvent = mutation({
	args: {
		name: v.string(),
		startsAtLocal: v.string(),
		endsAtLocal: v.string(),
	},
	handler: async (
		ctx,
		{ name, startsAtLocal, endsAtLocal }
	): Promise<Id<"events">> => {
		await requireRole(ctx, BOARD_LEVEL);
		assertLen(name, NAME_MAX, "Event name");
		const createdBy = await currentActorId(ctx);
		if (!createdBy) throw new Error("No acting person.");
		assertSiteZone(startsAtLocal);
		assertSiteZone(endsAtLocal);
		// The zoned string is the source of truth; the epoch is a cache derived
		// from it server-side — never trust a client-sent epoch.
		const startsAt = utcFromLocal(startsAtLocal);
		const endsAt = utcFromLocal(endsAtLocal);
		if (startsAt > endsAt)
			throw new Error("The start must be on or before the end.");
		const id = await ctx.db.insert("events", {
			name,
			startsAt,
			endsAt,
			startsAtLocal,
			endsAtLocal,
			createdBy,
			createdAt: Date.now(),
		});
		const event = await ctx.db.get(id);
		if (event) await scheduleEventReminders(ctx, event);
		return id;
	},
});

export const listEvents = query({
	args: {},
	handler: async (ctx): Promise<Doc<"events">[]> => {
		// Any entitled member with space access may see the event list (the
		// Events page grants `view` to guests+). Only board/admin can create —
		// see `createEvent` and the `<Can I="create">`-gated form on the page.
		await requireRole(ctx, COMMUNITY_TIERS);
		const rows = await ctx.db.query("events").collect();
		return rows.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const deleteEvent = mutation({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }): Promise<void> => {
		await requireRole(ctx, BOARD_LEVEL);
		const event = await ctx.db.get(eventId);
		if (event) await cancelEventReminders(ctx, event);
		// Delete the event doc first: it vanishes from listEvents/getEventPublic
		// immediately, which also shuts the confirm-orphan window (a pending
		// confirm checks the event still exists — see
		// lib/attendance.insertAttendanceOnce). Attendance can outlive the event
		// by a few scheduler ticks; nothing reads attendance without the event.
		await ctx.db.delete(eventId);
		// Attendance is bounded by turnout, which for a popular event can exceed
		// a single transaction's read/write limits — purge it in bounded,
		// self-rescheduling batches instead of one collect+delete.
		await ctx.scheduler.runAfter(0, internal.events.purgeEventAttendance, {
			eventId,
		});
	},
});

/**
 * Bounded batch delete of one event's attendance rows, keyed by the
 * `by_event` index. Reschedules itself while a full batch suggests more rows
 * remain — this converges because deleting shrinks the table (unlike patching
 * a `.take()` window, which never would). Not the forbidden "cancel your own
 * scheduled job" pattern: nothing here reads or cancels `_scheduled_functions`,
 * it just keeps deleting until the query comes back short.
 */
export const purgeEventAttendance = internalMutation({
	args: { eventId: v.id("events") },
	handler: async (ctx, { eventId }): Promise<void> => {
		const rows = await ctx.db
			.query("eventAttendance")
			.withIndex("by_event", (q) => q.eq("eventId", eventId))
			.take(BATCH_SIZE);
		for (const row of rows) await ctx.db.delete(row._id);
		if (rows.length === BATCH_SIZE) {
			await ctx.scheduler.runAfter(
				0,
				internal.events.purgeEventAttendance,
				{
					eventId,
				}
			);
		}
	},
});

export const updateEvent = mutation({
	args: {
		eventId: v.id("events"),
		name: v.optional(v.string()),
		startsAtLocal: v.optional(v.string()),
		endsAtLocal: v.optional(v.string()),
	},
	handler: async (ctx, { eventId, ...fields }): Promise<void> => {
		await requireRole(ctx, BOARD_LEVEL);
		assertLen(fields.name, NAME_MAX, "Event name");
		const existing = await ctx.db.get(eventId);
		if (!existing) throw new Error("Event not found.");
		// Each drawer field commits on its own, so merge the supplied field(s)
		// over the current row and validate the RESULT — a lone Starts edit must
		// not be allowed to invert the interval, and the name must not go blank.
		const name =
			fields.name !== undefined ? fields.name.trim() : existing.name;
		if (name === "") throw new Error("Event name is required.");
		// Patch a time field only when the caller supplied its `*Local`: each
		// drawer field autosaves on its own, so a lone Starts edit must leave
		// Ends (and its cached epoch) exactly as they were, and vice versa.
		let startsAt = existing.startsAt;
		let endsAt = existing.endsAt;
		if (fields.startsAtLocal !== undefined) {
			assertSiteZone(fields.startsAtLocal);
			startsAt = utcFromLocal(fields.startsAtLocal);
		}
		if (fields.endsAtLocal !== undefined) {
			assertSiteZone(fields.endsAtLocal);
			endsAt = utcFromLocal(fields.endsAtLocal);
		}
		if (startsAt > endsAt)
			throw new Error("The start must be on or before the end.");
		await ctx.db.patch(eventId, {
			name,
			...(fields.startsAtLocal !== undefined
				? { startsAt, startsAtLocal: fields.startsAtLocal }
				: {}),
			...(fields.endsAtLocal !== undefined
				? { endsAt, endsAtLocal: fields.endsAtLocal }
				: {}),
		});
		// Only a time change moves the reminders; the name is read when they fire.
		if (
			fields.startsAtLocal !== undefined ||
			fields.endsAtLocal !== undefined
		) {
			const updated = await ctx.db.get(eventId);
			if (updated) await scheduleEventReminders(ctx, updated);
		}
	},
});

/**
 * An event's confirmed attendees, newest first, with names resolved. Mirrors
 * personEvents.listForPerson's name-cache shape, though a cache buys little
 * here since each row is a distinct person by definition.
 */
export const listEventAttendees = query({
	args: { eventId: v.id("events") },
	handler: async (
		ctx,
		{ eventId }
	): Promise<
		{
			personId: Id<"people">;
			name: string;
			email: string;
			confirmedAt: number;
		}[]
	> => {
		await requireRole(ctx, BOARD_LEVEL);
		// Bounded like the delete sweep: turnout is unbounded in principle, so
		// cap the roster the drawer loads rather than risk a transaction /
		// response-size limit on a popular event. 500 is far above any real
		// J-floor event; a larger roster would want true pagination.
		const rows = await ctx.db
			.query("eventAttendance")
			.withIndex("by_event", (q) => q.eq("eventId", eventId))
			.take(500);
		const out = await Promise.all(
			rows.map(async (row) => {
				const person = await ctx.db.get(row.personId);
				return person
					? {
							personId: row.personId,
							name: displayName(person),
							email: person.email,
							confirmedAt: row.confirmedAt,
						}
					: null;
			})
		);
		return out
			.filter((a): a is NonNullable<typeof a> => a !== null)
			.sort((a, b) => b.confirmedAt - a.confirmedAt);
	},
});

export const getEventPublic = query({
	args: { eventId: v.id("events") },
	handler: async (
		ctx,
		{ eventId }
	): Promise<{
		name: string;
		startsAt: number;
		endsAt: number;
		startsAtLocal: string;
		endsAtLocal: string;
		ended: boolean;
	} | null> => {
		const event = await ctx.db.get(eventId);
		if (!event) return null;
		return {
			name: event.name,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			startsAtLocal: event.startsAtLocal,
			endsAtLocal: event.endsAtLocal,
			// Hard stop, no grace: every public grant point (registerVisitor,
			// confirmVisitorByToken, confirmEventInviteByToken, checkInToEvent)
			// treats an event as closed the instant Date.now() passes endsAt.
			ended: !eventLive(event, Date.now()),
		};
	},
});
