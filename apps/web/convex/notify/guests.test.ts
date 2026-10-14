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
	const backend = convexTest(schema, modules);
	const boardId = await backend.run((context) =>
		context.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return {
		backend,
		asBoard: backend.withIdentity({ email: "board@example.com" }),
		boardId,
	};
}

async function insertGuest(
	backend: TestConvex<typeof schema>,
	accessUntil: number,
	stage: "active" | "onboarding" | "expired" = "active",
	hostedById?: Id<"people">
) {
	return backend.run((context) =>
		context.db.insert("people", {
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

async function jobs(backend: TestConvex<typeof schema>) {
	return backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
}

async function dispatched(backend: TestConvex<typeof schema>) {
	const allJobs = await jobs(backend);
	return allJobs
		.filter((job) => job.name === "notify/dispatch:run")
		.map(
			(job) =>
				job.args[0] as {
					kind: string;
					payload: Record<string, unknown>;
				}
		);
}

async function dispatchedOfKind(
	backend: TestConvex<typeof schema>,
	kind: string
) {
	const sent = await dispatched(backend);
	return sent.filter((delivery) => delivery.kind === kind);
}

async function jobsNamed(backend: TestConvex<typeof schema>, name: string) {
	const allJobs = await jobs(backend);
	return allJobs.filter((job) => job.name === name);
}

describe("guest expiring soon", () => {
	it("is scheduled three days before the window closes when a guest is approved", async () => {
		const { backend, asBoard, boardId } = await setup();
		const id = await backend.run((context) =>
			context.db.insert("people", {
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
		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: { type: "APPROVE_GUEST", until, hostedById: boardId },
			})
		);
		const scheduled = await jobsNamed(
			backend,
			"notify/guests:expiringSoon"
		);
		const job = scheduled.at(0);
		expect(job?.args).toEqual([{ personId: id, accessUntil: until }]);
		expect(job?.scheduledTime).toBe(until - 3 * DAY);
	});

	it("is not scheduled when the window closes within three days", async () => {
		const { backend, asBoard, boardId } = await setup();
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);
		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: {
					type: "APPROVE_GUEST",
					until: Date.now() + 2 * DAY,
					hostedById: boardId,
				},
			})
		);
		expect(await jobsNamed(backend, "notify/guests:expiringSoon")).toEqual(
			[]
		);
	});

	it("notifies when the window is unchanged", async () => {
		const { backend, boardId } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(backend, until, "active", boardId);
		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil: until,
			})
		);
		expect(await dispatched(backend)).toEqual([
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
		const { backend } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(backend, until + 10 * DAY);
		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil: until,
			})
		);
		expect(await dispatched(backend)).toEqual([]);
	});
});

describe("guest expiring soon dedupe", () => {
	it("two jobs with identical args send once", async () => {
		const { backend } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(backend, until);
		const args = { personId: id, accessUntil: until };
		await runAndCollectLogs(backend, async () => {
			await backend.mutation(internal.notify.guests.expiringSoon, args);
			await backend.mutation(internal.notify.guests.expiringSoon, args);
		});
		expect(
			await dispatchedOfKind(backend, "guestExpiringSoon")
		).toHaveLength(1);
	});

	it("A to B to A sends at most once for A", async () => {
		const { backend } = await setup();
		const until = Date.now() + 3 * DAY;
		const id = await insertGuest(backend, until);
		function run(accessUntil: number) {
			return backend.mutation(internal.notify.guests.expiringSoon, {
				personId: id,
				accessUntil,
			});
		}
		await runAndCollectLogs(backend, async () => {
			await run(until);
			await backend.run((context) =>
				context.db.patch(id, { accessUntil: until + 10 * DAY })
			);
			await run(until);
			await backend.run((context) =>
				context.db.patch(id, { accessUntil: until })
			);
			await run(until);
		});
		expect(
			await dispatchedOfKind(backend, "guestExpiringSoon")
		).toHaveLength(1);
	});

	it("a same-date re-save schedules nothing new", async () => {
		const { backend, asBoard } = await setup();
		const until = Date.now() + 30 * DAY;
		const id = await insertGuest(backend, until);
		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.people.setGuestAccess, {
				id,
				expiresAt: until,
			})
		);
		expect(await jobsNamed(backend, "notify/guests:expiringSoon")).toEqual(
			[]
		);
	});
});

async function resave(
	from: number,
	to: number,
	stage: "active" | "expired" = "active"
) {
	const { backend, asBoard } = await setup();
	const id = await insertGuest(backend, from, stage);
	// Read the notifications before draining: draining fast-forwards the
	// clock, which fires the scheduled expiry and adds notifications the
	// mutation itself did not send.
	let sent: Awaited<ReturnType<typeof dispatched>> = [];
	await runAndCollectLogs(backend, async () => {
		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "EXTEND_WINDOW", until: to },
		});
		sent = await dispatched(backend);
	});
	return sent.filter(
		(delivery) =>
			delivery.kind === "guestAccessChanged" ||
			delivery.kind === "guestExpired"
	);
}

describe("guest window change classification", () => {
	it("unchanged date sends nothing", async () => {
		const until = Date.now() + 10 * DAY;
		expect(await resave(until, until)).toEqual([]);
	});

	it("a later date is extended", async () => {
		const from = Date.now() + 10 * DAY;
		const sent = await resave(from, from + 5 * DAY);
		expect(sent.map((delivery) => delivery.payload.change)).toEqual([
			"extended",
		]);
	});

	it("an earlier date is shortened", async () => {
		const from = Date.now() + 10 * DAY;
		const sent = await resave(from, from - 5 * DAY);
		expect(sent.map((delivery) => delivery.payload.change)).toEqual([
			"shortened",
		]);
	});

	it("a past date on an expired guest is not announced as extended", async () => {
		const sent = await resave(
			Date.now() - 5 * DAY,
			Date.now() - 2 * DAY,
			"expired"
		);
		expect(
			sent.some((delivery) => delivery.kind === "guestAccessChanged")
		).toBe(false);
	});
});

describe("guest expired", () => {
	it("notifies when the scheduled expiry actually expires the guest", async () => {
		const { backend } = await setup();
		const id = await insertGuest(backend, Date.now() - 1000);
		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.lifecycle.windowExpired, { personId: id })
		);
		expect(await dispatched(backend)).toContainEqual({
			kind: "guestExpired",
			payload: { guestId: id, guestName: "Gus Guest" },
		});
	});

	it("stays quiet when the window was extended before the job fired", async () => {
		const { backend } = await setup();
		const id = await insertGuest(backend, Date.now() + 10 * DAY);
		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.lifecycle.windowExpired, { personId: id })
		);
		expect(await dispatchedOfKind(backend, "guestExpired")).toEqual([]);
	});

	it("the nightly sweep notifies for every guest it expires", async () => {
		const { backend } = await setup();
		const id = await insertGuest(backend, Date.now() - 1000, "onboarding");
		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.lifecycle.sweepExpiredWindows, {})
		);
		expect(await dispatched(backend)).toContainEqual({
			kind: "guestExpired",
			payload: { guestId: id, guestName: "Gus Guest" },
		});
	});

	it("the sweep pages through a cohort bigger than one batch and notifies each guest once", async () => {
		const { backend } = await setup();
		const cohort = SWEEP_BATCH + 1;
		const ids = await backend.run(async (context) => {
			const out: Id<"people">[] = [];
			for (let index = 0; index < cohort; index++)
				out.push(
					await context.db.insert("people", {
						email: `g${String(index)}@example.com`,
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
		await runAndCollectLogs(backend, async () => {
			const firstPage = await backend.mutation(
				internal.lifecycle.sweepExpiredWindows,
				{}
			);
			expired = firstPage.expired;
			for (;;) {
				const allJobs = await jobs(backend);
				const next = allJobs.find(
					(job) =>
						job.name === "lifecycle:sweepExpiredWindows" &&
						!ran.has(job._id)
				);
				if (!next) break;
				ran.add(next._id);
				const page = await backend.mutation(
					internal.lifecycle.sweepExpiredWindows,
					next.args[0] as { cursor: string }
				);
				expired += page.expired;
			}
		});

		expect(ran.size).toBeGreaterThan(0);
		expect(expired).toBe(cohort);
		const stages = await backend.run(async (context) =>
			Promise.all(
				ids.map(async (id) => {
					const person = await context.db.get(id);
					return person?.stage;
				})
			)
		);
		expect(stages.every((stage) => stage === "expired")).toBe(true);
		const expiredNotices = await dispatchedOfKind(backend, "guestExpired");
		const notified = expiredNotices.map(
			(delivery) => delivery.payload.guestId
		);
		expect(notified).toHaveLength(cohort);
		expect(new Set(notified).size).toBe(cohort);
	});
});

describe("guest access changed", () => {
	it("extending the window notifies with the new end date", async () => {
		const { backend, asBoard } = await setup();
		const id = await insertGuest(backend, Date.now() + 5 * DAY);
		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.people.setGuestAccess, {
				id,
				expiresAt: Date.now() + 40 * DAY,
			})
		);
		expect(await dispatched(backend)).toContainEqual({
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
		const { backend, asBoard } = await setup();
		const id = await insertGuest(backend, Date.now() + 5 * DAY);
		await runAndCollectLogs(backend, () =>
			asBoard.mutation(api.people.upgradeGuestToMember, { id })
		);
		expect(await dispatched(backend)).toContainEqual({
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
