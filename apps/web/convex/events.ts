import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { eventLive } from "./lib/attendance.ts";
import { requireRole } from "./lib/authGuard.ts";
import type { EventsError } from "./lib/errors/events.ts";
import type { InputError } from "./lib/errors/input.ts";
import { displayName } from "./lib/names.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { SITE_TIMEZONE, utcFromLocal, zonedTimeZoneName } from "./lib/time.ts";
import { checkLength, NAME_MAX } from "./lib/validate.ts";
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
const ATTENDEE_ROSTER_CAP = 500;

/** Reject a caller-supplied `*Local` whose embedded IXDTF zone is not the
 *  site's. A board caller could embed e.g. `[America/Los_Angeles]`; the table
 *  formats the cached epoch in Zurich while the drawer formats the stored
 *  zone, so they'd silently disagree. Reject at the mutation boundary
 *  instead. */
function checkSiteZone(local: string): Result<void, EventsError | InputError> {
	return zonedTimeZoneName(local).andThen(
		(zone): Result<void, EventsError> =>
			zone === SITE_TIMEZONE
				? ok()
				: err({ type: "EventTimesNotInSiteZone" })
	);
}

export const createEvent = mutation({
	args: {
		name: v.string(),
		startsAtLocal: v.string(),
		endsAtLocal: v.string(),
	},
	handler: async (
		context,
		{ name, startsAtLocal, endsAtLocal }
	): Promise<Id<"events">> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(name, NAME_MAX));
		const createdBy = await currentActorId(context);
		invariant(createdBy, "No acting person.");
		unwrap(checkSiteZone(startsAtLocal));
		unwrap(checkSiteZone(endsAtLocal));
		// The zoned string is the source of truth; the epoch is a cache derived
		// from it server-side — never trust a client-sent epoch.
		const startsAt = utcFromLocal(startsAtLocal);
		const endsAt = utcFromLocal(endsAtLocal);
		if (startsAt > endsAt) refuse({ type: "EventStartAfterEnd" });
		const id = await context.db.insert("events", {
			name,
			startsAt,
			endsAt,
			startsAtLocal,
			endsAtLocal,
			createdBy,
			createdAt: Date.now(),
		});
		const event = await context.db.get(id);
		if (event) await scheduleEventReminders(context, event);
		return id;
	},
});

export const listEvents = query({
	args: {},
	handler: async (context): Promise<Doc<"events">[]> => {
		// Any entitled member with space access may see the event list (the
		// Events page grants `view` to guests+). Only board/admin can create —
		// see `createEvent` and the `<Can I="create">`-gated form on the page.
		unwrap(await requireRole(context, COMMUNITY_TIERS));
		const rows = await context.db.query("events").collect();
		// eslint-disable-next-line id-length -- conventional comparator parameter names
		return rows.sort((a, b) => b.createdAt - a.createdAt);
	},
});

export const deleteEvent = mutation({
	args: { eventId: v.id("events") },
	handler: async (context, { eventId }): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const event = await context.db.get(eventId);
		if (event) await cancelEventReminders(context, event);
		// Delete the event doc first: it vanishes from listEvents/getEventPublic
		// immediately, which also shuts the confirm-orphan window (a pending
		// confirm checks the event still exists — see
		// lib/attendance.insertAttendanceOnce). Attendance can outlive the event
		// by a few scheduler ticks; nothing reads attendance without the event.
		await context.db.delete(eventId);
		// Attendance is bounded by turnout, which for a popular event can exceed
		// a single transaction's read/write limits — purge it in bounded,
		// self-rescheduling batches instead of one collect+delete.
		await context.scheduler.runAfter(
			0,
			internal.events.purgeEventAttendance,
			{
				eventId,
			}
		);
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
	handler: async (context, { eventId }): Promise<void> => {
		const rows = await context.db
			.query("eventAttendance")
			.withIndex("by_event", (range) => range.eq("eventId", eventId))
			.take(BATCH_SIZE);
		for (const row of rows) await context.db.delete(row._id);
		if (rows.length === BATCH_SIZE) {
			await context.scheduler.runAfter(
				0,
				internal.events.purgeEventAttendance,
				{
					eventId,
				}
			);
		}
	},
});

type EventTimeFields = { startsAtLocal?: string; endsAtLocal?: string };

function mergedEventTimes(
	existing: { startsAt: number; endsAt: number },
	fields: EventTimeFields
): { startsAt: number; endsAt: number } {
	let startsAt = existing.startsAt;
	let endsAt = existing.endsAt;
	if (fields.startsAtLocal !== undefined) {
		unwrap(checkSiteZone(fields.startsAtLocal));
		startsAt = utcFromLocal(fields.startsAtLocal);
	}
	if (fields.endsAtLocal !== undefined) {
		unwrap(checkSiteZone(fields.endsAtLocal));
		endsAt = utcFromLocal(fields.endsAtLocal);
	}
	return { startsAt, endsAt };
}

function timeFieldsPatch(
	fields: EventTimeFields,
	times: { startsAt: number; endsAt: number }
) {
	return {
		...(fields.startsAtLocal === undefined
			? {}
			: {
					startsAt: times.startsAt,
					startsAtLocal: fields.startsAtLocal,
				}),
		...(fields.endsAtLocal === undefined
			? {}
			: { endsAt: times.endsAt, endsAtLocal: fields.endsAtLocal }),
	};
}

export const updateEvent = mutation({
	args: {
		eventId: v.id("events"),
		name: v.optional(v.string()),
		startsAtLocal: v.optional(v.string()),
		endsAtLocal: v.optional(v.string()),
	},
	handler: async (context, { eventId, ...fields }): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(fields.name, NAME_MAX));
		const existing = await context.db.get(eventId);
		if (!existing) return refuse({ type: "EventNotFound" });
		// Each drawer field commits on its own, so merge the supplied field(s)
		// over the current row and validate the RESULT — a lone Starts edit must
		// not be allowed to invert the interval, and the name must not go blank.
		const name =
			fields.name === undefined ? existing.name : fields.name.trim();
		if (name === "") refuse({ type: "EventNameRequired" });
		// Patch a time field only when the caller supplied its `*Local`: each
		// drawer field autosaves on its own, so a lone Starts edit must leave
		// Ends (and its cached epoch) exactly as they were, and vice versa.
		const { startsAt, endsAt } = mergedEventTimes(existing, fields);
		if (startsAt > endsAt) refuse({ type: "EventStartAfterEnd" });
		await context.db.patch(eventId, {
			name,
			...timeFieldsPatch(fields, { startsAt, endsAt }),
		});
		// Only a time change moves the reminders; the name is read when they fire.
		if (
			fields.startsAtLocal === undefined &&
			fields.endsAtLocal === undefined
		)
			return;
		const updated = await context.db.get(eventId);
		if (updated) await scheduleEventReminders(context, updated);
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
		context,
		{ eventId }
	): Promise<
		{
			personId: Id<"people">;
			name: string;
			email: string;
			confirmedAt: number;
		}[]
	> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		// Bounded like the delete sweep: turnout is unbounded in principle, so
		// cap the roster the drawer loads rather than risk a transaction /
		// response-size limit on a popular event. ATTENDEE_ROSTER_CAP is far above
		// any real J-floor event; a larger roster would want true pagination.
		const rows = await context.db
			.query("eventAttendance")
			.withIndex("by_event", (range) => range.eq("eventId", eventId))
			.take(ATTENDEE_ROSTER_CAP);
		const out = await Promise.all(
			rows.map(async (row) => {
				const person = await context.db.get(row.personId);
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
		return (
			out
				.filter(
					(
						attendance
					): attendance is NonNullable<typeof attendance> =>
						attendance !== null
				)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => b.confirmedAt - a.confirmedAt)
		);
	},
});

export const getEventPublic = query({
	args: { eventId: v.id("events") },
	handler: async (
		context,
		{ eventId }
	): Promise<{
		name: string;
		startsAt: number;
		endsAt: number;
		startsAtLocal: string;
		endsAtLocal: string;
		ended: boolean;
	} | null> => {
		const event = await context.db.get(eventId);
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
