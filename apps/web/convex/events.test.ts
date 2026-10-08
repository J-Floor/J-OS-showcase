import { parseAbsolute } from "@internationalized/date";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import {
	SITE_TIMEZONE,
	utcFromLocal,
	zonedDate,
	zonedLocalFromEpoch,
	zonedTime,
} from "./lib/time.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const BOARD_EMAIL = "boss@example.com";
const MEMBER_EMAIL = "m@example.com";

async function seedBoard(t: ReturnType<typeof convexTest>) {
	const boardId = await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { boardId, asBoard: t.withIdentity({ email: BOARD_EMAIL }) };
}

async function seedMember(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: MEMBER_EMAIL,
			firstName: "M",
			lastName: "",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: MEMBER_EMAIL });
}

const eventInput = {
	name: "Hackathon Demo Night",
	startsAtLocal: "2026-10-01T18:00:00+02:00[Europe/Zurich]",
	endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
};

/** A zoned IXDTF Local string for an arbitrary epoch, for boundary tests. */
function localFromEpoch(ms: number): string {
	return parseAbsolute(new Date(ms).toISOString(), SITE_TIMEZONE).toString();
}

describe("createEvent", () => {
	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const asMember = await seedMember(t);
		await expect(
			asMember.mutation(api.events.createEvent, eventInput)
		).rejects.toThrow();
	});

	it("stores name/dates with the caller as createdBy", async () => {
		const t = convexTest(schema, modules);
		const { boardId, asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.name).toBe(eventInput.name);
		expect(doc?.startsAt).toBe(utcFromLocal(eventInput.startsAtLocal));
		expect(doc?.endsAt).toBe(utcFromLocal(eventInput.endsAtLocal));
		expect(doc?.createdBy).toBe(boardId);
		expect(doc?.createdAt).toEqual(expect.any(Number));
	});

	it("stores IXDTF local + derived cached epoch", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const id = await asBoard.mutation(api.events.createEvent, {
			name: "Demo",
			startsAtLocal: "2026-09-20T00:01:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-09-20T23:59:00+02:00[Europe/Zurich]",
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		// Assert the cached epoch is the Zurich instant.
		expect(row!.startsAt).toBe(
			new Date("2026-09-19T22:01:00.000Z").getTime()
		);
		expect(row!.endsAt).toBe(
			new Date("2026-09-20T21:59:00.000Z").getTime()
		);
		// Assert the stored IXDTF via accessors, NOT string-equality (toString
		// formatting is a lib detail; @internationalized/date emits ":SS" seconds).
		expect(zonedDate(row!.startsAtLocal)).toBe("2026-09-20");
		expect(zonedTime(row!.startsAtLocal)).toBe("00:01");
		expect(utcFromLocal(row!.startsAtLocal)).toBe(row!.startsAt);
	});

	it("rejects starts after ends", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		await expect(
			asBoard.mutation(api.events.createEvent, {
				name: "Backwards",
				startsAtLocal: "2026-10-01T22:01:00+02:00[Europe/Zurich]",
				endsAtLocal: eventInput.endsAtLocal,
			})
		).rejects.toThrow(/start must be on or before the end/i);
	});

	it("rejects a non-Europe/Zurich embedded zone on startsAtLocal", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		await expect(
			asBoard.mutation(api.events.createEvent, {
				name: "Wrong Zone",
				startsAtLocal: "2026-10-01T09:00:00-07:00[America/Los_Angeles]",
				endsAtLocal: eventInput.endsAtLocal,
			})
		).rejects.toThrow(/Event times must be in Europe\/Zurich/);
	});

	it("rejects a non-Europe/Zurich embedded zone on endsAtLocal", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		await expect(
			asBoard.mutation(api.events.createEvent, {
				name: "Wrong Zone",
				startsAtLocal: eventInput.startsAtLocal,
				endsAtLocal: "2026-10-01T15:00:00-07:00[America/Los_Angeles]",
			})
		).rejects.toThrow(/Event times must be in Europe\/Zurich/);
	});

	it("accepts an Europe/Zurich embedded zone (still works)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.name).toBe(eventInput.name);
	});
});

describe("listEvents", () => {
	it("lets any entitled member see the list (view is granted to guests+)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		await asBoard.mutation(api.events.createEvent, eventInput);
		const asMember = await seedMember(t);
		const all = await asMember.query(api.events.listEvents, {});
		expect(all).toHaveLength(1);
		expect(all[0].name).toBe(eventInput.name);
	});

	it("rejects a signed-in identity with no person row", async () => {
		const t = convexTest(schema, modules);
		const asStranger = t.withIdentity({ email: "nobody@example.com" });
		await expect(
			asStranger.query(api.events.listEvents, {})
		).rejects.toThrow("Forbidden");
	});

	it("returns events newest first", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const firstId = await asBoard.mutation(api.events.createEvent, {
			...eventInput,
			name: "Older",
		});
		await t.run(async (ctx) =>
			ctx.db.patch(firstId, { createdAt: Date.now() - 1000 })
		);
		const secondId = await asBoard.mutation(api.events.createEvent, {
			...eventInput,
			name: "Newer",
		});
		const all = await asBoard.query(api.events.listEvents, {});
		expect(all.map((e) => e._id)).toEqual([secondId, firstId]);
	});
});

describe("deleteEvent", () => {
	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const asMember = await seedMember(t);
		await expect(
			asMember.mutation(api.events.deleteEvent, { eventId })
		).rejects.toThrow();
	});

	it("deletes the event immediately and schedules the attendance purge", async () => {
		const t = convexTest(schema, modules);
		const { boardId, asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await t.run((ctx) =>
			ctx.db.insert("eventAttendance", {
				personId: boardId,
				eventId,
				confirmedAt: Date.now(),
			})
		);
		expect(
			await t.run((ctx) => ctx.db.query("eventAttendance").collect())
		).toHaveLength(1);

		await asBoard.mutation(api.events.deleteEvent, { eventId });

		// The event itself is gone synchronously.
		const result = await t.query(api.events.getEventPublic, { eventId });
		expect(result).toBeNull();

		// convex-test never runs scheduled functions — it only records them at
		// enqueue time. Assert the purge job's name AND args are exactly right;
		// asserting merely "a job exists" wouldn't catch scheduling the wrong
		// function or the wrong eventId.
		const jobs = await t.run((ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].name).toBe("events:purgeEventAttendance");
		expect(jobs[0].args).toEqual([{ eventId }]);

		// The attendance row is NOT purged synchronously — that's the point of
		// the scheduled batch. It's still there until the job runs.
		expect(
			await t.run((ctx) => ctx.db.query("eventAttendance").collect())
		).toHaveLength(1);
	});
});

describe("purgeEventAttendance", () => {
	it("deletes an event's attendance rows in a bounded batch", async () => {
		const t = convexTest(schema, modules);
		const { boardId, asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await ctx.db.insert("eventAttendance", {
					personId: boardId,
					eventId,
					confirmedAt: Date.now(),
				});
			}
		});
		expect(
			await t.run((ctx) => ctx.db.query("eventAttendance").collect())
		).toHaveLength(3);

		await t.mutation(internal.events.purgeEventAttendance, { eventId });

		expect(
			await t.run((ctx) => ctx.db.query("eventAttendance").collect())
		).toEqual([]);
	});
});

describe("updateEvent", () => {
	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const asMember = await seedMember(t);
		await expect(
			asMember.mutation(api.events.updateEvent, {
				eventId,
				name: "Hijacked",
			})
		).rejects.toThrow();
	});

	it("patches only the name, leaving dates unchanged", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			name: "Renamed Demo Night",
		});
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.name).toBe("Renamed Demo Night");
		expect(doc?.startsAt).toBe(utcFromLocal(eventInput.startsAtLocal));
		expect(doc?.endsAt).toBe(utcFromLocal(eventInput.endsAtLocal));
		// Convex's `db.patch` treats an explicit `key: undefined` as "delete the
		// field" — so these must round-trip to the ORIGINAL strings, not merely
		// stay non-null. A handler that regressed to always sending
		// `endsAtLocal: fields.endsAtLocal` (undefined here) would silently wipe
		// this row's *Local and still pass an assertion that only checks
		// toBeDefined()/not-undefined.
		expect(doc?.startsAtLocal).toBe(eventInput.startsAtLocal);
		expect(doc?.endsAtLocal).toBe(eventInput.endsAtLocal);
	});

	it("patches startsAtLocal and endsAtLocal, leaving the name unchanged", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const newStartsAtLocal = "2026-11-01T18:00:00+01:00[Europe/Zurich]";
		const newEndsAtLocal = "2026-11-01T22:00:00+01:00[Europe/Zurich]";
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			startsAtLocal: newStartsAtLocal,
			endsAtLocal: newEndsAtLocal,
		});
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.name).toBe(eventInput.name);
		expect(doc?.startsAt).toBe(utcFromLocal(newStartsAtLocal));
		expect(doc?.endsAt).toBe(utcFromLocal(newEndsAtLocal));
		expect(zonedDate(doc!.startsAtLocal)).toBe("2026-11-01");
		expect(zonedTime(doc!.startsAtLocal)).toBe("18:00");
		expect(zonedDate(doc!.endsAtLocal)).toBe("2026-11-01");
		expect(zonedTime(doc!.endsAtLocal)).toBe("22:00");
	});

	it("rejects a blank name (leaves the event labelled)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await expect(
			asBoard.mutation(api.events.updateEvent, { eventId, name: "   " })
		).rejects.toThrow(/name is required/i);
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.name).toBe(eventInput.name);
	});

	it("rejects a lone Starts edit that would invert the interval", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		// Move Starts to after the existing Ends — must be rejected, not stored.
		await expect(
			asBoard.mutation(api.events.updateEvent, {
				eventId,
				startsAtLocal: "2026-10-01T22:01:00+02:00[Europe/Zurich]",
			})
		).rejects.toThrow(/start must be on or before the end/i);
		const doc = await t.run(async (ctx) => ctx.db.get(eventId));
		expect(doc?.startsAt).toBe(utcFromLocal(eventInput.startsAtLocal));
		// The mutation stores the client string verbatim (no toString()
		// round-trip), so a plain equality check is safe here.
		expect(doc?.startsAtLocal).toBe(eventInput.startsAtLocal);
	});

	it("supplying only startsAtLocal updates just the start fields, leaving endsAtLocal as it was", async () => {
		const t = convexTest(schema, modules);
		const { boardId, asBoard } = await seedBoard(t);
		// A row inserted directly (bypassing createEvent), with *Local derived
		// from its own epochs (required by the schema).
		const legacyStartsAt = utcFromLocal(eventInput.startsAtLocal);
		const legacyEndsAt = utcFromLocal(eventInput.endsAtLocal);
		const legacyEndsAtLocal = zonedLocalFromEpoch(
			legacyEndsAt,
			SITE_TIMEZONE
		);
		const eventId = await t.run((ctx) =>
			ctx.db.insert("events", {
				name: "Legacy Event",
				startsAt: legacyStartsAt,
				startsAtLocal: zonedLocalFromEpoch(
					legacyStartsAt,
					SITE_TIMEZONE
				),
				endsAt: legacyEndsAt,
				endsAtLocal: legacyEndsAtLocal,
				createdBy: boardId,
				createdAt: Date.now(),
			})
		);
		// Must stay before the existing (untouched) endsAt, which is
		// eventInput's 2026-10-01T22:00 Zurich.
		const newStartsAtLocal = "2026-09-25T09:00:00+02:00[Europe/Zurich]";
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			startsAtLocal: newStartsAtLocal,
		});
		const doc = await t.run((ctx) => ctx.db.get(eventId));
		expect(doc?.startsAtLocal).toBe(newStartsAtLocal);
		expect(doc?.startsAt).toBe(utcFromLocal(newStartsAtLocal));
		// endsAtLocal was not supplied, so it stays exactly as it was.
		expect(doc?.endsAtLocal).toBe(legacyEndsAtLocal);
		expect(doc?.endsAt).toBe(legacyEndsAt);
	});

	it("supplying only startsAtLocal on an already-migrated row leaves endsAtLocal DEFINED and unchanged", async () => {
		// Convex's `db.patch` treats an explicit `key: undefined` as "delete the
		// field" (not "leave it alone") — the legacy-row variant above can't
		// distinguish "handler didn't touch endsAtLocal" from "handler wrote
		// endsAtLocal: undefined", because it's undefined either way. Starting
		// from a row where endsAtLocal is a real string closes that gap: if the
		// handler ever regressed to always sending `endsAtLocal:
		// fields.endsAtLocal`, this row's *Local would be wiped and this
		// assertion would catch it.
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const newStartsAtLocal = "2026-09-25T09:00:00+02:00[Europe/Zurich]";
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			startsAtLocal: newStartsAtLocal,
		});
		const doc = await t.run((ctx) => ctx.db.get(eventId));
		expect(doc?.startsAtLocal).toBe(newStartsAtLocal);
		expect(doc?.startsAt).toBe(utcFromLocal(newStartsAtLocal));
		expect(doc?.endsAtLocal).toBe(eventInput.endsAtLocal);
		expect(doc?.endsAt).toBe(utcFromLocal(eventInput.endsAtLocal));
	});

	it("accepts an edit when both *Local are supplied", async () => {
		const t = convexTest(schema, modules);
		const { boardId, asBoard } = await seedBoard(t);
		const startsAt = utcFromLocal(eventInput.startsAtLocal);
		const endsAt = utcFromLocal(eventInput.endsAtLocal);
		const eventId = await t.run((ctx) =>
			ctx.db.insert("events", {
				name: "Legacy Event",
				startsAt,
				startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
				endsAt,
				endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
				createdBy: boardId,
				createdAt: Date.now(),
			})
		);
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			startsAtLocal: eventInput.startsAtLocal,
			endsAtLocal: eventInput.endsAtLocal,
		});
		const doc = await t.run((ctx) => ctx.db.get(eventId));
		expect(doc?.startsAtLocal).toBe(eventInput.startsAtLocal);
		expect(doc?.endsAtLocal).toBe(eventInput.endsAtLocal);
	});

	it("rejects a non-Europe/Zurich embedded zone on a supplied startsAtLocal", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await expect(
			asBoard.mutation(api.events.updateEvent, {
				eventId,
				startsAtLocal: "2026-10-01T09:00:00-07:00[America/Los_Angeles]",
			})
		).rejects.toThrow(/Event times must be in Europe\/Zurich/);
	});

	it("rejects a non-Europe/Zurich embedded zone on a supplied endsAtLocal", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await expect(
			asBoard.mutation(api.events.updateEvent, {
				eventId,
				endsAtLocal: "2026-10-01T15:00:00-07:00[America/Los_Angeles]",
			})
		).rejects.toThrow(/Event times must be in Europe\/Zurich/);
	});

	it("accepts an Europe/Zurich embedded zone on update (still works)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		// Before eventInput's existing endsAtLocal (2026-10-01T22:00 Zurich).
		const newStartsAtLocal = "2026-10-01T19:00:00+02:00[Europe/Zurich]";
		await asBoard.mutation(api.events.updateEvent, {
			eventId,
			startsAtLocal: newStartsAtLocal,
		});
		const doc = await t.run((ctx) => ctx.db.get(eventId));
		expect(doc?.startsAtLocal).toBe(newStartsAtLocal);
	});
});

describe("listEventAttendees", () => {
	it("rejects a non-board caller", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const asMember = await seedMember(t);
		await expect(
			asMember.query(api.events.listEventAttendees, { eventId })
		).rejects.toThrow();
	});

	it("resolves attendees to name/email/confirmedAt, newest first", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const alice = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "alice@example.com",
				firstName: "Alice",
				lastName: "Anders",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const bob = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "bob@example.com",
				firstName: "Bob",
				lastName: "Baker",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const earlier = Date.now() - 1000;
		const later = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert("eventAttendance", {
				personId: alice,
				eventId,
				confirmedAt: earlier,
			});
			await ctx.db.insert("eventAttendance", {
				personId: bob,
				eventId,
				confirmedAt: later,
			});
		});

		const attendees = await asBoard.query(api.events.listEventAttendees, {
			eventId,
		});

		expect(attendees).toEqual([
			{
				personId: bob,
				name: "Bob Baker",
				email: "bob@example.com",
				confirmedAt: later,
			},
			{
				personId: alice,
				name: "Alice Anders",
				email: "alice@example.com",
				confirmedAt: earlier,
			},
		]);
	});

	it("skips an attendance row whose person no longer exists", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		const ghost = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ghost@example.com",
				firstName: "Ghost",
				lastName: "Gone",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run(async (ctx) =>
			ctx.db.insert("eventAttendance", {
				personId: ghost,
				eventId,
				confirmedAt: Date.now(),
			})
		);
		await t.run(async (ctx) => ctx.db.delete(ghost));

		const attendees = await asBoard.query(api.events.listEventAttendees, {
			eventId,
		});
		expect(attendees).toEqual([]);
	});
});

describe("getEventPublic", () => {
	it("returns name, dates (epoch + zoned), and ended, unauthenticated", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		// Dated relative to now, so `ended: false` holds whatever day this
		// runs. eventInput's fixed date passed on 2026-10-01 and turned this red.
		const now = Date.now();
		const upcoming = {
			name: eventInput.name,
			startsAtLocal: localFromEpoch(now + 86_400_000),
			endsAtLocal: localFromEpoch(now + 2 * 86_400_000),
		};
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			upcoming
		);
		const result = await t.query(api.events.getEventPublic, { eventId });
		expect(result).toEqual({
			name: upcoming.name,
			startsAt: utcFromLocal(upcoming.startsAtLocal),
			endsAt: utcFromLocal(upcoming.endsAtLocal),
			startsAtLocal: upcoming.startsAtLocal,
			endsAtLocal: upcoming.endsAtLocal,
			ended: false,
		});
		expect(Object.keys(result ?? {}).sort()).toEqual(
			[
				"ended",
				"endsAt",
				"endsAtLocal",
				"name",
				"startsAt",
				"startsAtLocal",
			].sort()
		);
	});

	it("returns null for a missing event", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await t.run(async (ctx) => ctx.db.delete(eventId));
		const result = await t.query(api.events.getEventPublic, { eventId });
		expect(result).toBeNull();
	});

	it("ended is false for an event whose endsAt is still in the future (boundary: now + 100000)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(api.events.createEvent, {
			name: "Still Open",
			startsAtLocal: localFromEpoch(Date.now()),
			endsAtLocal: localFromEpoch(Date.now() + 100_000),
		});
		const result = await t.query(api.events.getEventPublic, { eventId });
		expect(result?.ended).toBe(false);
	});

	it("ended is true for an event whose endsAt is in the past (boundary: now - 1000)", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const eventId = await asBoard.mutation(api.events.createEvent, {
			name: "Already Over",
			startsAtLocal: localFromEpoch(Date.now() - 200_000),
			endsAtLocal: localFromEpoch(Date.now() - 1000),
		});
		const result = await t.query(api.events.getEventPublic, { eventId });
		expect(result?.ended).toBe(true);
	});
});

describe("event name length cap", () => {
	it("createEvent and updateEvent reject a 201-char name", async () => {
		const t = convexTest(schema, modules);
		const { asBoard } = await seedBoard(t);
		const message = "Event name is too long (max 200 characters).";
		await expect(
			asBoard.mutation(api.events.createEvent, {
				...eventInput,
				name: "n".repeat(201),
			})
		).rejects.toThrow(message);
		const eventId = await asBoard.mutation(
			api.events.createEvent,
			eventInput
		);
		await expect(
			asBoard.mutation(api.events.updateEvent, {
				eventId,
				name: "n".repeat(201),
			})
		).rejects.toThrow(message);
	});
});
