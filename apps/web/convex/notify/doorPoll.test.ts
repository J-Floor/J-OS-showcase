import { convexTest, type TestConvex } from "convex-test";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type MockInstance,
} from "vitest";

import { internal } from "../_generated/api";
import { setDoorProviderForTests } from "../lib/doorProvider.ts";
import { FakeDoorProvider } from "../lib/fakeDoorProvider.ts";
import { RENAG_MS } from "../opsAlerts.ts";
import schema from "../schema.ts";

import {
	setPushSenderForTests,
	type PushSender,
} from "./channels/pushSender.ts";

const dispatchFailure = vi.hoisted(() => ({
	failNext: false,
	headlines: [] as string[],
	details: [] as string[],
}));

vi.mock("./notify.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./notify.ts")>();
	return {
		...actual,
		notifyNow: ((...args: Parameters<typeof actual.notifyNow>) => {
			dispatchFailure.headlines.push(
				String((args[2] as { headline?: string }).headline)
			);
			dispatchFailure.details.push(
				String((args[2] as { detail?: string }).detail)
			);
			if (dispatchFailure.failNext) {
				dispatchFailure.failNext = false;
				dispatchFailure.headlines = [];
				return Promise.reject(new Error("dispatch down"));
			}
			return actual.notifyNow(...args);
		}) as typeof actual.notifyNow,
	};
});

const modules = import.meta.glob("/convex/**/*.*s");

const DOWN = "1";
const UP = "2";

/** Inject a fake door provider with both locks, `offline` ones unreachable. */
function stubLocks(offline: string[] = []) {
	const provider = new FakeDoorProvider({
		identities: [],
		locks: [
			{ lockId: DOWN, name: "Downstairs" },
			{ lockId: UP, name: "Upstairs" },
		],
	});
	for (const id of offline) provider.offline.add(id);
	setDoorProviderForTests(provider);
	return provider;
}

async function setup() {
	const t = convexTest(schema, modules);
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t;
}

let log: MockInstance<typeof console.log>;
beforeEach(() => {
	log = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
	dispatchFailure.failNext = false;
	setPushSenderForTests(undefined);
	setDoorProviderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function alertsSent(): number {
	return log.mock.calls.filter((c) =>
		String(c[0]).startsWith("[notify:doorAlert]")
	).length;
}

async function fingerprint(t: TestConvex<typeof schema>) {
	const row = await t.run((ctx) =>
		ctx.db
			.query("opsAlerts")
			.withIndex("by_key", (q) => q.eq("key", "door-online"))
			.unique()
	);
	return row?.fingerprint;
}

describe("door poll", () => {
	it("seeds a healthy state silently, alerts once on offline, stays quiet while offline, and announces recovery", async () => {
		const t = await setup();

		stubLocks();
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("");
		expect(alertsSent()).toBe(0);

		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("2");
		expect(alertsSent()).toBe(1);

		await t.action(internal.notify.doorPoll.poll, {});
		expect(alertsSent()).toBe(1);

		stubLocks();
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("");
		expect(alertsSent()).toBe(2);
		expect(dispatchFailure.headlines.at(-1)).toBe(
			"Every door lock is back online."
		);
	});

	it("announces every change of the offline set and names the current one", async () => {
		const t = await setup();

		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("2");
		expect(alertsSent()).toBe(1);

		stubLocks([DOWN, UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("1,2");
		expect(alertsSent()).toBe(2);
		expect(dispatchFailure.headlines.at(-1)).toBe(
			"Downstairs, Upstairs offline."
		);
		expect(dispatchFailure.details.at(-1)).toBe(
			"These locks have dropped off the door provider, so the app cannot open them."
		);

		stubLocks([DOWN]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("1");
		expect(alertsSent()).toBe(3);
		expect(dispatchFailure.headlines.at(-1)).toBe("Downstairs offline.");
		expect(dispatchFailure.details.at(-1)).toBe(
			"The lock has dropped off the door provider, so the app cannot open it."
		);
	});

	it("alerts on the very first poll when a lock is already offline", async () => {
		const t = await setup();
		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBe("2");
		expect(alertsSent()).toBe(1);
	});
});

describe("door poll without a configured door provider", () => {
	it("logs and skips, recording nothing", async () => {
		const t = await setup();
		await t.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(t)).toBeUndefined();
		expect(alertsSent()).toBe(0);
		expect(
			log.mock.calls.some((c) => String(c[0]).startsWith("[door-poll]"))
		).toBe(true);
	});
});

describe("door poll delivery", () => {
	beforeEach(() => {
		vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
		vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
		vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
	});

	async function pushOnlyBoard() {
		const t = convexTest(schema, modules);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "b@example.org",
				firstName: "B",
				lastName: "O",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				notificationPrefs: { doors: { push: true, email: false } },
			})
		);
		await t.run((ctx) =>
			ctx.db.insert("pushSubscriptions", {
				personId,
				endpoint: "https://push/b",
				p256dh: "p",
				auth: "a",
				userAgent: "test",
				createdAt: Date.now(),
			})
		);
		return t;
	}

	async function alertRow(t: TestConvex<typeof schema>) {
		return t.run((ctx) =>
			ctx.db
				.query("opsAlerts")
				.withIndex("by_key", (q) => q.eq("key", "door-online"))
				.unique()
		);
	}

	it("retries an alert that reached nobody on the next poll", async () => {
		const t = await pushOnlyBoard();
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);

		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect((await alertRow(t))?.lastSentAt).toBe(0);

		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
		expect((await alertRow(t))?.lastSentAt).toBeGreaterThan(0);

		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
	});

	it("re-sends the offline alert after a week with the same offline set", async () => {
		const t = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);

		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(1);

		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("opsAlerts")
				.withIndex("by_key", (q) => q.eq("key", "door-online"))
				.unique();
			if (row)
				await ctx.db.patch(row._id, {
					lastSentAt: Date.now() - RENAG_MS - 1000,
				});
		});
		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(2);
	});

	it("releases the claim when dispatch throws, then re-sends on the next poll", async () => {
		const t = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);

		stubLocks([UP]);
		dispatchFailure.failNext = true;
		await expect(
			t.action(internal.notify.doorPoll.poll, {})
		).rejects.toThrow("dispatch down");
		expect((await alertRow(t))?.lastSentAt).toBe(0);
		expect(sender).not.toHaveBeenCalled();

		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
		expect((await alertRow(t))?.lastSentAt).toBeGreaterThan(0);
	});

	it("does not retry a back-online alert that reached nobody", async () => {
		const t = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubLocks([UP]);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(1);

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		stubLocks();
		await t.action(internal.notify.doorPoll.poll, {});
		expect((await alertRow(t))?.lastSentAt).toBeGreaterThan(0);

		const later = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(later);
		await t.action(internal.notify.doorPoll.poll, {});
		expect(later).not.toHaveBeenCalled();
	});
});
