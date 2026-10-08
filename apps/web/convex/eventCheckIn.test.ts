import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { issueToken } from "./lib/confirmToken.ts";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

// Helpers below take the tester as a parameter. Capture its fully-typed shape
// from a real call: a bare `ReturnType<typeof convexTest>` drops the schema, so
// `ctx.db` inside `t.run` loses the `people` indexes and fields.
function createTester() {
	return convexTest(schema, modules);
}
type Tester = ReturnType<typeof createTester>;

const BOARD_EMAIL = "boss@example.com";

async function seedBoard(t: Tester) {
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

async function seedEvent(t: Tester) {
	const { asBoard } = await seedBoard(t);
	return asBoard.mutation(api.events.createEvent, {
		name: "Hack Night",
		startsAtLocal: zonedLocalFromEpoch(Date.now(), SITE_TIMEZONE),
		endsAtLocal: zonedLocalFromEpoch(
			Date.now() + 86_400_000,
			SITE_TIMEZONE
		),
	});
}

// Boundary-pinned per the endsAt hard-stop spec: endsAt = now - 1000 is
// unambiguously in the past.
async function seedEndedEvent(t: Tester) {
	const { asBoard } = await seedBoard(t);
	return asBoard.mutation(api.events.createEvent, {
		name: "Ended Hack Night",
		startsAtLocal: zonedLocalFromEpoch(Date.now() - 200_000, SITE_TIMEZONE),
		endsAtLocal: zonedLocalFromEpoch(Date.now() - 1000, SITE_TIMEZONE),
	});
}

describe("confirmEventInvite", () => {
	it("confirmEventInvite dedup-inserts attendance and consumes the invite token", async () => {
		const t = createTester();
		await t.run((ctx) =>
			ctx.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const eventId = await seedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "m@example.org",
				firstName: "M",
				lastName: "X",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: 1000,
			})
		);

		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "inv",
		});

		expect(res.status).toBe("verified");
		expect(res.wifi).toEqual({
			ssid: "Test Net",
			password: "test-wifi-password",
		});
		const attendance = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(attendance.filter((a) => a.eventId === eventId)).toHaveLength(1);
		const invites = await t.run((ctx) =>
			ctx.db.query("confirmTokens").collect()
		);
		expect(invites).toHaveLength(1);
		expect(invites[0].consumedAt).toBeTypeOf("number");

		// A second confirm on the (now-deleted) invite must not throw or double
		// the attendance row.
		const second = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "inv",
		});
		expect(second.status).toBe("invalid");
		const attendance2 = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(attendance2.filter((a) => a.eventId === eventId)).toHaveLength(
			1
		);
	});

	it("confirmEventInvite returns expired for an invite past its expiry, without inserting attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "m2@example.org",
				firstName: "M2",
				lastName: "X",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "stale-inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: -1000,
			})
		);

		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "stale-inv",
		});

		expect(res).toEqual({ status: "expired" });
		const attendance = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(attendance).toHaveLength(0);
		const invites = await t.run((ctx) =>
			ctx.db.query("confirmTokens").collect()
		);
		expect(invites).toHaveLength(1);
	});

	it("confirmEventInvite returns ended and writes no attendance when the invite's event has ended", async () => {
		const t = createTester();
		const eventId = await seedEndedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "ended-invite@example.org",
				firstName: "E",
				lastName: "I",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "ended-inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: 1000,
			})
		);

		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "ended-inv",
		});

		expect(res).toEqual({ status: "ended" });
		const attendance = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(attendance).toHaveLength(0);
	});

	it("confirmEventInvite returns ended, without Wi-Fi, when the invite's event was deleted", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "deleted-event@example.org",
				firstName: "D",
				lastName: "E",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "deleted-inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: 60_000,
			})
		);
		await t.run((ctx) => ctx.db.delete(eventId));

		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "deleted-inv",
		});

		expect(res).toEqual({ status: "ended" });
	});

	it("a kicked person's invite is refused", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "k@example.com",
				firstName: "K",
				lastName: "",
				tier: "former",
				stage: "active",
				stageSince: 0,
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: 1000,
			})
		);
		const res = await t.mutation(
			internal.eventCheckIn.confirmEventInviteByToken,
			{ token: "inv" }
		);
		expect(res.status).toBe("invalid");
		expect(
			await t.run((ctx) => ctx.db.query("eventAttendance").collect())
		).toHaveLength(0);
	});

	it("confirmEventInvite returns invalid for an unknown token", async () => {
		const t = createTester();
		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "does-not-exist",
		});
		expect(res).toEqual({ status: "invalid" });
	});

	it("confirmEventInvite whose person was purged returns invalid and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "gone@example.org",
				firstName: "Gone",
				lastName: "Prospect",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);
		await t.run((ctx) =>
			issueToken(ctx, {
				token: "orphan-inv",
				purpose: "eventInvite",
				personId,
				eventId,
				ttlMs: 1000,
			})
		);
		// purgeUnverified deleted the prospect between registration and this
		// click, leaving an invite whose personId now dangles. Recording
		// attendance for a person who no longer exists must not happen.
		await t.run((ctx) => ctx.db.delete(personId));

		const res = await t.action(api.eventCheckIn.confirmEventInvite, {
			token: "orphan-inv",
		});

		expect(res).toEqual({ status: "invalid" });
		const attendance = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(attendance).toHaveLength(0);
	});
});

describe("checkInToEvent", () => {
	it("an entitled authed identity checking in produces exactly one attendance row", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const email = "member@example.org";
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asMember = t.withIdentity({ email });

		const result = await asMember.mutation(
			api.eventCheckIn.checkInToEvent,
			{
				eventId,
			}
		);

		expect(result).toEqual({ ok: true });
		const rows = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].eventId).toBe(eventId);
	});

	it("checking in twice stays at exactly one attendance row (dedup via insertAttendanceOnce)", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const email = "member2@example.org";
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Mem",
				lastName: "Two",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asMember = t.withIdentity({ email });

		await asMember.mutation(api.eventCheckIn.checkInToEvent, { eventId });
		await asMember.mutation(api.eventCheckIn.checkInToEvent, { eventId });

		const rows = await t.run((ctx) =>
			ctx.db
				.query("eventAttendance")
				.withIndex("by_person", (q) => q.eq("personId", personId))
				.collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("throws for a not-entitled authed identity (e.g. expired access) and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const email = "expired@example.org";
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Ex",
				lastName: "Pired",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		const asExpired = t.withIdentity({ email });

		await expect(
			asExpired.mutation(api.eventCheckIn.checkInToEvent, { eventId })
		).rejects.toThrow("Access expired or revoked");
		const rows = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("refuses a staff person and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		const email = "staff@example.org";
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Sta",
				lastName: "Ff",
				tier: "staff",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asStaff = t.withIdentity({ email });

		await expect(
			asStaff.mutation(api.eventCheckIn.checkInToEvent, { eventId })
		).rejects.toThrow("Forbidden");
		const rows = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("throws for an unauthenticated caller and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);

		await expect(
			t.mutation(api.eventCheckIn.checkInToEvent, { eventId })
		).rejects.toThrow("Not authenticated");
		const rows = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("throws Event has ended for an event past its endsAt and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEndedEvent(t);
		const email = "member-ended@example.org";
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Mem",
				lastName: "Ended",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asMember = t.withIdentity({ email });

		await expect(
			asMember.mutation(api.eventCheckIn.checkInToEvent, { eventId })
		).rejects.toThrow("Event has ended");
		const rows = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("throws Event not found for a deleted/nonexistent event and writes no attendance", async () => {
		const t = createTester();
		const eventId = await seedEvent(t);
		await t.run((ctx) => ctx.db.delete(eventId));
		const email = "member3@example.org";
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "Mem",
				lastName: "Three",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asMember = t.withIdentity({ email });

		await expect(
			asMember.mutation(api.eventCheckIn.checkInToEvent, { eventId })
		).rejects.toThrow("Event not found");
		const rows = await t.run((ctx) =>
			ctx.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});
});
