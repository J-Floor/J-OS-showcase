import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema.ts";

import { BACKFILL_BATCH } from "./backfill.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type T = TestConvex<typeof schema>;

// The backfill re-schedules itself with `runAfter(0)`. convex-test backs every
// scheduled job with a real `setTimeout`, so the continuation would fire on its
// own after the test (and its console mock) is gone, racing worker teardown.
// Fake timers keep those callbacks from ever firing; the tests run jobs by hand.
beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function allJobs(t: T) {
	return t.run((ctx) =>
		ctx.db.system.query("_scheduled_functions").collect()
	);
}

async function jobNames(t: T, prefix: string) {
	return (await allJobs(t)).filter((j) => j.name.startsWith(prefix));
}

/** Kick the backfill off with `{}`, then run each self-scheduled continuation
 *  by hand (running every scheduled job would also fire the reminders it just
 *  scheduled), summing the per-page counts. Jobs left by an earlier run are
 *  not replayed. */
async function runBackfill(t: T) {
	const total = { events: 0, guests: 0, pages: 0 };
	const ran = new Set<string>();
	for (const job of await allJobs(t)) ran.add(job._id);
	let page = await t.mutation(internal.notify.backfill.scheduleExisting, {});
	for (;;) {
		total.events += page.events;
		total.guests += page.guests;
		total.pages += 1;
		const next = (await allJobs(t)).find(
			(j) =>
				j.name === "notify/backfill:scheduleExisting" && !ran.has(j._id)
		);
		if (!next) break;
		ran.add(next._id);
		page = await t.mutation(
			internal.notify.backfill.scheduleExisting,
			next.args[0] as {
				phase: "events" | "guests";
				cursor: string | null;
			}
		);
	}
	expect(page.done).toBe(true);
	return total;
}

async function insertPerson(
	t: T,
	email: string,
	fields: {
		tier: "guest" | "member";
		stage?: "active" | "expired";
		accessUntil?: number;
		guestExpiryRemindedFor?: number;
	}
) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email,
			firstName: email,
			lastName: "",
			stage: "active",
			stageSince: Date.now(),
			...fields,
		})
	);
}

async function insertEvent(
	t: T,
	createdBy: Id<"people">,
	startsAt: number,
	extra: {
		reminderJobIds?: { startingSoon?: Id<"_scheduled_functions"> };
	} = {}
) {
	return t.run((ctx) =>
		ctx.db.insert("events", {
			name: "Demo",
			startsAt,
			endsAt: startsAt + 2 * HOUR,
			startsAtLocal: "x",
			endsAtLocal: "y",
			createdBy,
			createdAt: Date.now(),
			...extra,
		})
	);
}

describe("notify backfill", () => {
	it("schedules future events without reminders only", async () => {
		const t = convexTest(schema, modules);
		const owner = await insertPerson(t, "o@example.com", {
			tier: "member",
		});
		const future = await insertEvent(t, owner, Date.now() + 2 * DAY);
		const past = await insertEvent(t, owner, Date.now() - 2 * DAY);
		const jobId = await t.run((ctx) =>
			ctx.scheduler.runAfter(
				DAY,
				internal.notify.eventReminders.startingSoon,
				{
					eventId: future,
					startsAt: 0,
				}
			)
		);
		const done = await insertEvent(t, owner, Date.now() + 3 * DAY, {
			reminderJobIds: { startingSoon: jobId },
		});
		const empty = await insertEvent(t, owner, Date.now() + 4 * DAY, {
			reminderJobIds: {},
		});

		const result = await runBackfill(t);

		expect(result.events).toBe(1);
		const rows = await t.run(async (ctx) => ({
			future: await ctx.db.get(future),
			past: await ctx.db.get(past),
			done: await ctx.db.get(done),
			empty: await ctx.db.get(empty),
		}));
		expect(rows.future?.reminderJobIds?.startingSoon).toBeDefined();
		expect(rows.future?.reminderJobIds?.endingSoon).toBeDefined();
		expect(rows.past?.reminderJobIds).toBeUndefined();
		expect(rows.done?.reminderJobIds).toEqual({ startingSoon: jobId });
		expect(rows.empty?.reminderJobIds).toEqual({});
		expect(await jobNames(t, "notify/eventReminders:")).toHaveLength(3);
	});

	it("schedules expiring-soon only for eligible guests", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const ten = now + 10 * DAY;
		await insertPerson(t, "a@example.com", {
			tier: "guest",
			accessUntil: ten,
		});
		await insertPerson(t, "b@example.com", {
			tier: "guest",
			accessUntil: now + 2 * DAY,
		});
		await insertPerson(t, "c@example.com", {
			tier: "guest",
			stage: "expired",
			accessUntil: ten,
		});
		await insertPerson(t, "d@example.com", {
			tier: "member",
			accessUntil: ten,
		});
		await insertPerson(t, "e@example.com", {
			tier: "guest",
			accessUntil: ten,
			guestExpiryRemindedFor: ten,
		});

		const result = await runBackfill(t);

		expect(result.guests).toBe(1);
		const jobs = await jobNames(t, "notify/guests:");
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.scheduledTime).toBe(ten - 3 * DAY);
	});

	it("pages through events and guests bigger than one batch", async () => {
		const t = convexTest(schema, modules);
		const owner = await insertPerson(t, "o@example.com", {
			tier: "member",
		});
		const count = BACKFILL_BATCH + 1;
		const until = Date.now() + 10 * DAY;
		await t.run(async (ctx) => {
			for (let i = 0; i < count; i++) {
				await ctx.db.insert("events", {
					name: `E${String(i)}`,
					startsAt: Date.now() + 2 * DAY,
					endsAt: Date.now() + 2 * DAY + 2 * HOUR,
					startsAtLocal: "x",
					endsAtLocal: "y",
					createdBy: owner,
					createdAt: Date.now(),
				});
				await ctx.db.insert("people", {
					email: `g${String(i)}@example.com`,
					firstName: "G",
					lastName: "",
					tier: "guest",
					stage: "active",
					stageSince: Date.now(),
					accessUntil: until,
				});
			}
		});

		const result = await runBackfill(t);

		expect(result.events).toBe(count);
		expect(result.guests).toBe(count);
		expect(result.pages).toBeGreaterThanOrEqual(4);
		expect(await jobNames(t, "notify/guests:")).toHaveLength(count);
	});

	it("a re-run skips events, and a duplicate guest job sends only one reminder", async () => {
		const t = convexTest(schema, modules);
		const owner = await insertPerson(t, "o@example.com", {
			tier: "member",
		});
		await insertEvent(t, owner, Date.now() + 2 * DAY);
		await insertPerson(t, "g@example.com", {
			tier: "guest",
			accessUntil: Date.now() + 10 * DAY,
		});

		const first = await runBackfill(t);
		const second = await runBackfill(t);

		expect(first).toMatchObject({ events: 1, guests: 1 });
		expect(second).toMatchObject({ events: 0, guests: 1 });
		expect(await jobNames(t, "notify/eventReminders:")).toHaveLength(2);
		const reminders = await jobNames(t, "notify/guests:");
		expect(reminders).toHaveLength(2);

		for (const job of reminders)
			await t.mutation(
				internal.notify.guests.expiringSoon,
				job.args[0] as { personId: Id<"people">; accessUntil: number }
			);

		const sent = (await jobNames(t, "notify/dispatch:run")).filter(
			(j) => (j.args[0] as { kind: string }).kind === "guestExpiringSoon"
		);
		expect(sent).toHaveLength(1);
	});
});
