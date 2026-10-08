import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { runAndCollectLogs } from "../../test-stubs/runAndCollectLogs.ts";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { SWEEP_BATCH } from "../lifecycle.ts";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const DAY = 86_400_000;

async function setup() {
	const t = convexTest(schema, modules);
	const boardId = await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return {
		t,
		asBoard: t.withIdentity({ email: "board@example.com" }),
		boardId,
	};
}

async function insertGuest(
	t: TestConvex<typeof schema>,
	accessUntil: number,
	stage: "active" | "onboarding" | "expired" = "active",
	hostedById?: Id<"people">
) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email: "gus@example.com",
			firstName: "Gus",
			lastName: "Guest",
			tier: "guest",
			stage,
			stageSince: Date.now(),
			accessFrom: Date.now() - DAY,
			accessUntil,
			hostedById,
		})
	);
}

async function jobs(t: TestConvex<typeof schema>) {
	return t.run((ctx) =>
		ctx.db.system.query("_scheduled_functions").collect()
	);
}

async function dispatched(t: TestConvex<typeof schema>) {
	return (await jobs(t))
		.filter((j) => j.name === "notify/dispatch:run")
		.map(
			(j) =>
				j.args[0] as { kind: string; payload: Record<string, unknown> }
		);
}

describe("guest expiring soon", () => {
	it("is scheduled three days before the window closes when a guest is approved", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);
		const until = Date.now() + 30 * DAY;
		await runAndCollectLogs(t, () =>
			asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: { type: "APPROVE_GUEST", until, hostedById: boardId },
			})
		);
		const job = (await jobs(t)).find(
			(j) => j.name === "notify/guests:expiringSoon"
		);
		expect(job?.args).toEqual([{ personId: id, accessUntil: until }]);
		expect(job?.scheduledTime).toBe(until - 3 * DAY);
	});

	it("is not scheduled when the window closes within three days", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);
		await runAndCollectLogs(t, () =>
			asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: {
					type: "APPROVE_GUEST",
					until: Date.now() + 2 * DAY,
					hostedById: boardId,
				},
			})
		);
		expect(
			(await jobs(t)).some((j) => j.name === "notify/guests:expiringSoon")
		).toBe(false);
	});

	it("notifies when the window is unchanged", async () => {
		const { t, boardId } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(t, until, "active", boardId);
		await runAndCollectLogs(t, () =>
			t.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil: until,
			})
		);
		expect(await dispatched(t)).toEqual([
			{
				kind: "guestExpiringSoon",
				payload: {
					guestId: id,
					guestName: "Gus Guest",
					untilDate: expect.any(String) as string,
				},
			},
		]);
	});

	it("no-ops when the window was changed since it was scheduled", async () => {
		const { t } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(t, until + 10 * DAY);
		await runAndCollectLogs(t, () =>
			t.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil: until,
			})
		);
		expect(await dispatched(t)).toEqual([]);
	});
});

describe("guest expiring soon dedupe", () => {
	it("two jobs with identical args send once", async () => {
		const { t } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(t, until);
		const args = { personId: id, accessUntil: until };
		await runAndCollectLogs(t, async () => {
			await t.mutation(internal.notify.guests.expiringSoon, args);
			await t.mutation(internal.notify.guests.expiringSoon, args);
		});
		expect(
			(await dispatched(t)).filter((d) => d.kind === "guestExpiringSoon")
		).toHaveLength(1);
	});

	it("A to B to A sends at most once for A", async () => {
		const { t } = await setup();
		const a = Date.now() + 3 * DAY;
		const id = await insertGuest(t, a);
		function run(accessUntil: number) {
			return t.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil,
			});
		}
		await runAndCollectLogs(t, async () => {
			await run(a);
			await t.run((ctx) =>
				ctx.db.patch(id, { accessUntil: a + 10 * DAY })
			);
			await run(a);
			await t.run((ctx) => ctx.db.patch(id, { accessUntil: a }));
			await run(a);
		});
		expect(
			(await dispatched(t)).filter((d) => d.kind === "guestExpiringSoon")
		).toHaveLength(1);
	});

	it("a same-date re-save schedules nothing new", async () => {
		const { t, asBoard } = await setup();
		const until = Date.now() + 30 * DAY;
		const id = await insertGuest(t, until);
		await runAndCollectLogs(t, () =>
			asBoard.mutation(api.people.setGuestAccess, {
				id,
				expiresAt: until,
			})
		);
		expect(
			(await jobs(t)).filter(
				(j) => j.name === "notify/guests:expiringSoon"
			)
		).toEqual([]);
	});
});

describe("guest window change classification", () => {
	async function resave(
		from: number,
		to: number,
		stage: "active" | "expired" = "active"
	) {
		const { t, asBoard } = await setup();
		const id = await insertGuest(t, from, stage);
		// Read the notifications before draining: draining fast-forwards the
		// clock, which fires the scheduled expiry and adds notifications the
		// mutation itself did not send.
		let sent: Awaited<ReturnType<typeof dispatched>> = [];
		await runAndCollectLogs(t, async () => {
			await asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: { type: "EXTEND_WINDOW", until: to },
			});
			sent = await dispatched(t);
		});
		return sent.filter(
			(d) => d.kind === "guestAccessChanged" || d.kind === "guestExpired"
		);
	}

	it("unchanged date sends nothing", async () => {
		const until = Date.now() + 10 * DAY;
		expect(await resave(until, until)).toEqual([]);
	});

	it("a later date is extended", async () => {
		const from = Date.now() + 10 * DAY;
		const sent = await resave(from, from + 5 * DAY);
		expect(sent.map((d) => d.payload.change)).toEqual(["extended"]);
	});

	it("an earlier date is shortened", async () => {
		const from = Date.now() + 10 * DAY;
		const sent = await resave(from, from - 5 * DAY);
		expect(sent.map((d) => d.payload.change)).toEqual(["shortened"]);
	});

	it("a past date on an expired guest is not announced as extended", async () => {
		const sent = await resave(
			Date.now() - 5 * DAY,
			Date.now() - 2 * DAY,
			"expired"
		);
		expect(sent.some((d) => d.kind === "guestAccessChanged")).toBe(false);
	});
});

describe("guest expired", () => {
	it("notifies when the scheduled expiry actually expires the guest", async () => {
		const { t } = await setup();
		const id = await insertGuest(t, Date.now() - 1000);
		await runAndCollectLogs(t, () =>
			t.mutation(internal.lifecycle.windowExpired, { personId: id })
		);
		expect(await dispatched(t)).toContainEqual({
			kind: "guestExpired",
			payload: { guestId: id, guestName: "Gus Guest" },
		});
	});

	it("stays quiet when the window was extended before the job fired", async () => {
		const { t } = await setup();
		const id = await insertGuest(t, Date.now() + 10 * DAY);
		await runAndCollectLogs(t, () =>
			t.mutation(internal.lifecycle.windowExpired, { personId: id })
		);
		expect(
			(await dispatched(t)).some((d) => d.kind === "guestExpired")
		).toBe(false);
	});

	it("the nightly sweep notifies for every guest it expires", async () => {
		const { t } = await setup();
		const id = await insertGuest(t, Date.now() - 1000, "onboarding");
		await runAndCollectLogs(t, () =>
			t.mutation(internal.lifecycle.sweepExpiredWindows, {})
		);
		expect(await dispatched(t)).toContainEqual({
			kind: "guestExpired",
			payload: { guestId: id, guestName: "Gus Guest" },
		});
	});

	it("the sweep pages through a cohort bigger than one batch and notifies each guest once", async () => {
		const { t } = await setup();
		const cohort = SWEEP_BATCH + 1;
		const ids = await t.run(async (ctx) => {
			const out: Id<"people">[] = [];
			for (let i = 0; i < cohort; i++)
				out.push(
					await ctx.db.insert("people", {
						email: `g${String(i)}@example.com`,
						firstName: "Gus",
						lastName: "Guest",
						tier: "guest",
						stage: "active",
						stageSince: Date.now(),
						accessUntil: Date.now() - 1000,
					})
				);
			return out;
		});

		// Drive the self-scheduled continuations by hand: running every
		// scheduled job would also fire the expiry side effects.
		let expired = 0;
		const ran = new Set<string>();
		await runAndCollectLogs(t, async () => {
			expired = (
				await t.mutation(internal.lifecycle.sweepExpiredWindows, {})
			).expired;
			for (;;) {
				const next = (await jobs(t)).find(
					(j) =>
						j.name === "lifecycle:sweepExpiredWindows" &&
						!ran.has(j._id)
				);
				if (!next) break;
				ran.add(next._id);
				expired += (
					await t.mutation(
						internal.lifecycle.sweepExpiredWindows,
						next.args[0] as { cursor: string }
					)
				).expired;
			}
		});

		expect(ran.size).toBeGreaterThan(0);
		expect(expired).toBe(cohort);
		const stages = await t.run(async (ctx) =>
			Promise.all(ids.map(async (id) => (await ctx.db.get(id))?.stage))
		);
		expect(stages.every((s) => s === "expired")).toBe(true);
		const notified = (await dispatched(t))
			.filter((d) => d.kind === "guestExpired")
			.map((d) => d.payload.guestId);
		expect(notified).toHaveLength(cohort);
		expect(new Set(notified).size).toBe(cohort);
	});
});

describe("guest access changed", () => {
	it("extending the window notifies with the new end date", async () => {
		const { t, asBoard } = await setup();
		const id = await insertGuest(t, Date.now() + 5 * DAY);
		await runAndCollectLogs(t, () =>
			asBoard.mutation(api.people.setGuestAccess, {
				id,
				expiresAt: Date.now() + 40 * DAY,
			})
		);
		expect(await dispatched(t)).toContainEqual({
			kind: "guestAccessChanged",
			payload: {
				guestId: id,
				guestName: "Gus Guest",
				change: "extended",
				untilDate: expect.any(String) as string,
			},
		});
	});

	it("upgrading the guest to member notifies the upgrade", async () => {
		const { t, asBoard } = await setup();
		const id = await insertGuest(t, Date.now() + 5 * DAY);
		await runAndCollectLogs(t, () =>
			asBoard.mutation(api.people.upgradeGuestToMember, { id })
		);
		expect(await dispatched(t)).toContainEqual({
			kind: "guestAccessChanged",
			payload: {
				guestId: id,
				guestName: "Gus Guest",
				change: "upgraded",
			},
		});
	});
});

describe("guestUntilLabel", () => {
	it("shows the inclusive chosen day for a Model-B end-of-day instant", async () => {
		const { guestUntilLabel } = await import("./guests.ts");
		const { composeExpiry, SITE_TIMEZONE } = await import("../lib/time.ts");
		const zoned = composeExpiry("2026-10-18", SITE_TIMEZONE)!;
		expect(guestUntilLabel(zoned.local, zoned.utc)).toBe("18 October 2026");
	});
});
