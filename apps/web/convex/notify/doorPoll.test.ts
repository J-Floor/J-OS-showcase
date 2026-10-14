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
	const backend = convexTest(schema, modules);
	await backend.run((context) =>
		context.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend;
}

let log: MockInstance<typeof console.log>;
beforeEach(() => {
	log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	dispatchFailure.failNext = false;
	setPushSenderForTests(undefined);
	setDoorProviderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function alertsSent(): number {
	return log.mock.calls.filter((call) =>
		String(call[0]).startsWith("[notify:doorAlert]")
	).length;
}

async function fingerprint(backend: TestConvex<typeof schema>) {
	const row = await backend.run((context) =>
		context.db
			.query("opsAlerts")
			.withIndex("by_key", (range) => range.eq("key", "door-online"))
			.unique()
	);
	return row?.fingerprint;
}

describe("door poll", () => {
	it("seeds a healthy state silently, alerts once on offline, stays quiet while offline, and announces recovery", async () => {
		const backend = await setup();

		stubLocks();
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("");
		expect(alertsSent()).toBe(0);

		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("2");
		expect(alertsSent()).toBe(1);

		await backend.action(internal.notify.doorPoll.poll, {});
		expect(alertsSent()).toBe(1);

		stubLocks();
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("");
		expect(alertsSent()).toBe(2);
		expect(dispatchFailure.headlines.at(-1)).toBe(
			"Every door lock is back online."
		);
	});

	it("announces every change of the offline set and names the current one", async () => {
		const backend = await setup();

		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("2");
		expect(alertsSent()).toBe(1);

		stubLocks([DOWN, UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("1,2");
		expect(alertsSent()).toBe(2);
		expect(dispatchFailure.headlines.at(-1)).toBe(
			"Downstairs, Upstairs offline."
		);
		expect(dispatchFailure.details.at(-1)).toBe(
			"These locks have dropped off the door provider, so the app cannot open them."
		);

		stubLocks([DOWN]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("1");
		expect(alertsSent()).toBe(3);
		expect(dispatchFailure.headlines.at(-1)).toBe("Downstairs offline.");
		expect(dispatchFailure.details.at(-1)).toBe(
			"The lock has dropped off the door provider, so the app cannot open it."
		);
	});

	it("alerts on the very first poll when a lock is already offline", async () => {
		const backend = await setup();
		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBe("2");
		expect(alertsSent()).toBe(1);
	});
});

describe("door poll without a configured door provider", () => {
	it("logs and skips, recording nothing", async () => {
		const backend = await setup();
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await fingerprint(backend)).toBeUndefined();
		expect(alertsSent()).toBe(0);
		expect(
			log.mock.calls.some((call) =>
				String(call[0]).startsWith("[door-poll]")
			)
		).toBe(true);
	});
});

async function pushOnlyBoard() {
	const backend = convexTest(schema, modules);
	const personId = await backend.run((context) =>
		context.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
			notificationPrefs: { doors: { push: true, email: false } },
		})
	);
	await backend.run((context) =>
		context.db.insert("pushSubscriptions", {
			personId,
			endpoint: "https://push/b",
			p256dh: "p",
			auth: "a",
			userAgent: "test",
			createdAt: Date.now(),
		})
	);
	return backend;
}

async function alertRow(backend: TestConvex<typeof schema>) {
	return backend.run((context) =>
		context.db
			.query("opsAlerts")
			.withIndex("by_key", (range) => range.eq("key", "door-online"))
			.unique()
	);
}

async function alertLastSentAt(backend: TestConvex<typeof schema>) {
	const row = await alertRow(backend);
	return row?.lastSentAt;
}

describe("door poll delivery", () => {
	beforeEach(() => {
		vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
		vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
		vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
	});

	it("retries an alert that reached nobody on the next poll", async () => {
		const backend = await pushOnlyBoard();
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});

		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await alertLastSentAt(backend)).toBe(0);

		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
		expect(await alertLastSentAt(backend)).toBeGreaterThan(0);

		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
	});

	it("re-sends the offline alert after a week with the same offline set", async () => {
		const backend = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);

		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(1);

		await backend.run(async (context) => {
			const row = await context.db
				.query("opsAlerts")
				.withIndex("by_key", (range) => range.eq("key", "door-online"))
				.unique();
			if (row)
				await context.db.patch(row._id, {
					lastSentAt: Date.now() - RENAG_MS - 1000,
				});
		});
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(2);
	});

	it("releases the claim when dispatch throws, then re-sends on the next poll", async () => {
		const backend = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);

		stubLocks([UP]);
		dispatchFailure.failNext = true;
		await expect(
			backend.action(internal.notify.doorPoll.poll, {})
		).rejects.toThrow("dispatch down");
		expect(await alertLastSentAt(backend)).toBe(0);
		expect(sender).not.toHaveBeenCalled();

		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledOnce();
		expect(await alertLastSentAt(backend)).toBeGreaterThan(0);
	});

	it("does not retry a back-online alert that reached nobody", async () => {
		const backend = await pushOnlyBoard();
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubLocks([UP]);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(sender).toHaveBeenCalledTimes(1);

		vi.spyOn(console, "error").mockImplementation(() => {});
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		stubLocks();
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(await alertLastSentAt(backend)).toBeGreaterThan(0);

		const later = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(later);
		await backend.action(internal.notify.doorPoll.poll, {});
		expect(later).not.toHaveBeenCalled();
	});
});
