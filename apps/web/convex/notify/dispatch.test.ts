import { v } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "../lib/time.ts";
import schema from "../schema.ts";

import {
	setPushSenderForTests,
	type PushSender,
} from "./channels/pushSender.ts";
import { notify } from "./notify.ts";

const pushBuilder = vi.hoisted(() => ({
	failFor: undefined as string | undefined,
}));

vi.mock("./registry.ts", async (importOriginal) => {
	const original = await importOriginal<typeof import("./registry.ts")>();
	return {
		...original,
		kindDef: (kind: Parameters<typeof original.kindDef>[0]) => {
			const def = original.kindDef(kind);
			return {
				...def,
				push: (payload: unknown, recipient: { email: string }) => {
					if (recipient.email === pushBuilder.failFor) {
						throw new Error("push builder broke");
					}
					return def.push(payload, recipient as never);
				},
			};
		},
	};
});

const modules = import.meta.glob("/convex/**/*.*s");

type T = ReturnType<typeof convexTest>;

async function seedPerson(
	t: T,
	email: string,
	tier: "member" | "board" = "member",
	notificationPrefs?: { tasks?: { push: boolean; email: boolean } }
): Promise<Id<"people">> {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email,
			firstName: email.split("@")[0],
			lastName: "X",
			tier,
			stage: "active",
			stageSince: Date.now(),
			notificationPrefs,
		})
	);
}

async function seedSubscription(
	t: T,
	personId: Id<"people">,
	endpoint: string
) {
	await t.run((ctx) =>
		ctx.db.insert("pushSubscriptions", {
			personId,
			endpoint,
			p256dh: "p",
			auth: "a",
			userAgent: "test",
			createdAt: Date.now(),
		})
	);
}

async function seedTask(t: T, createdBy: Id<"people">): Promise<Id<"tasks">> {
	return t.run((ctx) =>
		ctx.db.insert("tasks", {
			title: "Wire it",
			status: "backlog",
			assigneeIds: [],
			createdBy,
		})
	);
}

function stubVapid(): void {
	vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
	vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
	vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
}

function captureLogs() {
	const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
	return () =>
		spy.mock.calls
			.map((c) => String(c[0]))
			.filter((line) => line.startsWith("[notify:"));
}

afterEach(() => {
	pushBuilder.failFor = undefined;
	setPushSenderForTests(undefined);
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("dispatch", () => {
	it("sends push and email when both are on (the default)", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		await seedSubscription(t, ada, "https://push/ada");
		const taskId = await seedTask(t, ada);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(result).toEqual({ recipients: 1, delivered: 2, failed: 0 });
		expect(sender).toHaveBeenCalledOnce();
		expect(emails()).toEqual([
			"[notify:taskAssigned] ada@example.org: You've been assigned a task: Wire it",
		]);
	});

	it("respects a person's switches per channel", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org", "member", {
			tasks: { push: false, email: true },
		});
		const bob = await seedPerson(t, "bob@example.org", "member", {
			tasks: { push: true, email: false },
		});
		await seedSubscription(t, ada, "https://push/ada");
		await seedSubscription(t, bob, "https://push/bob");
		const taskId = await seedTask(t, ada);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();

		await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});
		await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: bob, taskId, taskTitle: "Wire it" },
		});

		expect(sender.mock.calls.map((c) => c[0].endpoint)).toEqual([
			"https://push/bob",
		]);
		expect(emails()).toEqual([
			"[notify:taskAssigned] ada@example.org: You've been assigned a task: Wire it",
		]);
	});

	it("never emails a push-only kind, even with email on", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		await seedSubscription(t, ada, "https://push/ada");
		const startsAt = Date.now() + 3_600_000;
		const endsAt = startsAt + 3_600_000;
		const eventId = await t.run((ctx) =>
			ctx.db.insert("events", {
				name: "Demo",
				startsAt,
				endsAt,
				startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
				endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
				createdBy: ada,
				createdAt: Date.now(),
			})
		);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();

		await t.action(internal.notify.dispatch.run, {
			kind: "eventEndingSoon",
			payload: {
				eventId,
				name: "Demo",
				endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
			},
		});

		expect(sender).toHaveBeenCalledOnce();
		expect(emails()).toEqual([]);
	});

	it("a failed email does not stop the push, and is reported as a failure", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		await seedSubscription(t, ada, "https://push/ada");
		const taskId = await seedTask(t, ada);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("resend down"))
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(sender).toHaveBeenCalledOnce();
		expect(result).toEqual({ recipients: 1, delivered: 1, failed: 1 });
	});

	it("one recipient's push failure does not block the next recipient", async () => {
		const t = convexTest(schema, modules);
		const b1 = await seedPerson(t, "b1@example.org", "board");
		const b2 = await seedPerson(t, "b2@example.org", "board");
		await seedSubscription(t, b1, "https://push/b1");
		await seedSubscription(t, b2, "https://push/b2");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const sender = vi.fn<PushSender>((s) =>
			s.endpoint === "https://push/b1"
				? Promise.reject(new Error("boom"))
				: Promise.resolve()
		);
		setPushSenderForTests(sender);
		stubVapid();
		captureLogs();

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "doorAlert",
			payload: {
				headline: "h",
				detail: "d",
				consequence: "c",
				tag: "door",
			},
		});

		expect(sender).toHaveBeenCalledTimes(2);
		expect(result.recipients).toBe(2);
		// b2 push + two board emails; b1 push is the one failure
		expect(result.delivered).toBe(3);
		expect(result.failed).toBe(1);
	});

	it("one slow recipient does not hold up the others' delivery", async () => {
		const t = convexTest(schema, modules);
		const b1 = await seedPerson(t, "b1@example.org", "board");
		const b2 = await seedPerson(t, "b2@example.org", "board");
		await seedSubscription(t, b1, "https://push/b1");
		await seedSubscription(t, b2, "https://push/b2");
		let releaseSlow: (() => void) | undefined;
		const sender = vi.fn<PushSender>((s) =>
			s.endpoint === "https://push/b1"
				? new Promise<void>((resolve) => {
						releaseSlow = resolve;
					})
				: Promise.resolve()
		);
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();

		const pending = t.action(internal.notify.dispatch.run, {
			kind: "doorAlert",
			payload: {
				headline: "h",
				detail: "d",
				consequence: "c",
				tag: "door",
			},
		});

		// b1's push is still hanging, yet b2 has had its push and its email.
		await vi.waitFor(() => {
			expect(sender).toHaveBeenCalledTimes(2);
			expect(
				emails().some((line) => line.includes("b2@example.org"))
			).toBe(true);
		});
		expect(emails().some((line) => line.includes("b1@example.org"))).toBe(
			false
		);
		releaseSlow?.();

		expect(await pending).toEqual({
			recipients: 2,
			delivered: 4,
			failed: 0,
		});
	});

	it("an email the provider rejects counts as failed, not delivered", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		const taskId = await seedTask(t, ada);
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: () => Promise.resolve("boom"),
			})
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(result).toEqual({ recipients: 1, delivered: 0, failed: 1 });
	});

	it("reports delivered 0 and failed > 0 when every channel fails", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		await seedSubscription(t, ada, "https://push/ada");
		const taskId = await seedTask(t, ada);
		setPushSenderForTests(() => Promise.reject(new Error("push down")));
		stubVapid();
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("resend down"))
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(result.delivered).toBe(0);
		expect(result.failed).toBeGreaterThan(0);
	});

	it("a null email side is a skip, not a delivery or a failure", async () => {
		const t = convexTest(schema, modules);
		const host = await seedPerson(t, "host@example.org", "board");
		const guest = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "guest@example.org",
				firstName: "Gus",
				lastName: "X",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() + 86_400_000,
				hostedById: host,
				notificationPrefs: { guests: { push: false, email: true } },
			})
		);
		await seedPerson(t, "other@example.org");
		const emails = captureLogs();

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "guestAccessChanged",
			payload: { guestId: guest, guestName: "Gus X", change: "upgraded" },
		});

		expect(result).toEqual({ recipients: 2, delivered: 1, failed: 0 });
		expect(emails()).toHaveLength(1);
		expect(emails()[0]).toContain("host@example.org");
	});

	it("notify schedules the dispatch action from a mutation", async () => {
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@example.org");
		const taskId = await seedTask(t, ada);
		await t.run((ctx) =>
			notify(ctx, "taskAssigned", {
				assigneeId: ada,
				taskId,
				taskTitle: "Wire it",
			})
		);
		const jobs = await t.run((ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual([
			expect.objectContaining({
				name: "notify/dispatch:run",
				args: [
					{
						kind: "taskAssigned",
						payload: {
							assigneeId: ada,
							taskId,
							taskTitle: "Wire it",
						},
					},
				],
			}),
		]);
	});
});

describe("history", () => {
	it("writes one row per recipient with the push title, body and in-app path", async () => {
		vi.stubEnv("SITE_URL", "https://j.floor");
		const t = convexTest(schema, modules);
		const b1 = await seedPerson(t, "b1@jfloor.test", "board");
		const b2 = await seedPerson(t, "b2@jfloor.test", "board");
		captureLogs();

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "doorAlert",
			payload: {
				headline: "Upstairs lock is offline.",
				detail: "d",
				consequence: "Check the lock.",
				tag: "door",
			},
		});

		// Neither board member has a device: the emails are the deliveries.
		expect(result).toEqual({ recipients: 2, delivered: 2, failed: 0 });
		const rows = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(rows.map((r) => r.personId).sort()).toEqual([b1, b2].sort());
		for (const row of rows) {
			expect(row).toMatchObject({
				kind: "doorAlert",
				title: "Upstairs lock is offline.",
				body: "Check the lock.",
				url: "/space?tab=diagnostics",
			});
		}
	});

	it("keeps a row for a recipient with push and email both off for the category", async () => {
		vi.stubEnv("SITE_URL", "https://j.floor");
		const t = convexTest(schema, modules);
		const ada = await seedPerson(t, "ada@jfloor.test", "member", {
			tasks: { push: false, email: false },
		});
		await seedSubscription(t, ada, "https://push/ada");
		const taskId = await seedTask(t, ada);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(result).toEqual({ recipients: 1, delivered: 0, failed: 0 });
		expect(sender).not.toHaveBeenCalled();
		expect(emails()).toEqual([]);
		const rows = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(rows).toEqual([
			expect.objectContaining({
				personId: ada,
				kind: "taskAssigned",
				title: "New task assigned",
				body: "Wire it",
				url: `/tasks?task=${taskId}`,
			}),
		]);
	});

	it("a failed history write is logged, and push and email still go out", async () => {
		const failingRecord = internalMutation({
			args: { kind: v.string(), rows: v.array(v.any()) },
			handler: (): Promise<null> =>
				Promise.reject(new Error("inbox down")),
		});
		const t = convexTest(schema, {
			...modules,
			"/convex/notify/inbox.ts": async () => ({
				...(await import("./inbox.ts")),
				record: failingRecord,
			}),
		});
		const ada = await seedPerson(t, "ada@jfloor.test");
		await seedSubscription(t, ada, "https://push/ada");
		const taskId = await seedTask(t, ada);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();
		const errors = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "taskAssigned",
			payload: { assigneeId: ada, taskId, taskTitle: "Wire it" },
		});

		expect(result).toEqual({ recipients: 1, delivered: 2, failed: 0 });
		expect(sender).toHaveBeenCalledOnce();
		expect(emails()).toEqual([
			"[notify:taskAssigned] ada@jfloor.test: You've been assigned a task: Wire it",
		]);
		expect(errors).toHaveBeenCalledWith(
			"[notify:taskAssigned] history write failed",
			new Error("inbox down")
		);
		expect(
			await t.run((ctx) => ctx.db.query("notifications").collect())
		).toEqual([]);
	});

	it("a throwing push builder skips that recipient's row and push, not their email or anyone else", async () => {
		const t = convexTest(schema, modules);
		const b1 = await seedPerson(t, "b1@jfloor.test", "board");
		const b2 = await seedPerson(t, "b2@jfloor.test", "board");
		await seedSubscription(t, b1, "https://push/b1");
		await seedSubscription(t, b2, "https://push/b2");
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const emails = captureLogs();
		const errors = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		pushBuilder.failFor = "b1@jfloor.test";

		const result = await t.action(internal.notify.dispatch.run, {
			kind: "doorAlert",
			payload: {
				headline: "h",
				detail: "d",
				consequence: "c",
				tag: "door",
			},
		});

		// b2 push + two emails delivered; b1's push is the one failure
		expect(result).toEqual({ recipients: 2, delivered: 3, failed: 1 });
		expect(sender.mock.calls.map((c) => c[0].endpoint)).toEqual([
			"https://push/b2",
		]);
		expect(
			emails().filter((line) => line.includes("b1@jfloor.test"))
		).toHaveLength(1);
		expect(errors).toHaveBeenCalledWith(
			"[notify:doorAlert] push message for b1@jfloor.test failed",
			new Error("push builder broke")
		);
		const rows = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(rows.map((r) => r.personId)).toEqual([b2]);
	});
});
