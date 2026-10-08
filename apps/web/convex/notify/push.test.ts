import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema.ts";

import {
	setPushSenderForTests,
	type PushSender,
} from "./channels/pushSender.ts";

const modules = import.meta.glob("/convex/**/*.*s");

const MESSAGE = { title: "T", body: "B", url: "/x", tag: "t" };

function stubVapid(): void {
	vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
	vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
	vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
}

function httpError(statusCode: number): Error {
	return Object.assign(new Error(`HTTP ${String(statusCode)}`), {
		statusCode,
	});
}

async function seedSubscription(
	t: ReturnType<typeof convexTest>,
	endpoint: string
) {
	await t.run(async (ctx) => {
		const personId = await ctx.db.insert("people", {
			email: `${endpoint.slice(-1)}@example.org`,
			firstName: "A",
			lastName: "B",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		});
		await ctx.db.insert("pushSubscriptions", {
			personId,
			endpoint,
			p256dh: "p",
			auth: "a",
			userAgent: "test",
			createdAt: Date.now(),
		});
	});
}

afterEach(() => {
	setPushSenderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("push channel", () => {
	it("sends the message as JSON with the VAPID details", async () => {
		const t = convexTest(schema, modules);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		stubVapid();
		const result = await t.action(internal.notify.channels.push.send, {
			subscriptions: [
				{ endpoint: "https://push/1", p256dh: "p", auth: "a" },
			],
			message: MESSAGE,
		});
		expect(result).toEqual({ delivered: 1, failed: 0 });
		const [subscription, body, vapid] = sender.mock.calls[0];
		expect(subscription).toEqual({
			endpoint: "https://push/1",
			p256dh: "p",
			auth: "a",
		});
		expect(JSON.parse(body)).toEqual(MESSAGE);
		expect(vapid).toEqual({
			subject: "mailto:board@example.com",
			publicKey: "pub",
			privateKey: "priv",
		});
	});

	it.each([404, 410])(
		"deletes a subscription the push service reports gone (%i)",
		async (status) => {
			const t = convexTest(schema, modules);
			await seedSubscription(t, "https://push/1");
			setPushSenderForTests(() => Promise.reject(httpError(status)));
			stubVapid();
			const result = await t.action(internal.notify.channels.push.send, {
				subscriptions: [
					{ endpoint: "https://push/1", p256dh: "p", auth: "a" },
				],
				message: MESSAGE,
			});
			expect(result).toEqual({ delivered: 0, failed: 0 });
			const rows = await t.run((ctx) =>
				ctx.db.query("pushSubscriptions").collect()
			);
			expect(rows).toHaveLength(0);
		}
	);

	it("counts other errors as failures, keeps the row, and still sends the rest", async () => {
		const t = convexTest(schema, modules);
		await seedSubscription(t, "https://push/1");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const sender = vi.fn<PushSender>((subscription) =>
			subscription.endpoint === "https://push/1"
				? Promise.reject(httpError(500))
				: Promise.resolve()
		);
		setPushSenderForTests(sender);
		stubVapid();
		const result = await t.action(internal.notify.channels.push.send, {
			subscriptions: [
				{ endpoint: "https://push/1", p256dh: "p", auth: "a" },
				{ endpoint: "https://push/2", p256dh: "p", auth: "a" },
			],
			message: MESSAGE,
		});
		expect(result).toEqual({ delivered: 1, failed: 1 });
		const rows = await t.run((ctx) =>
			ctx.db.query("pushSubscriptions").collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("sends to a recipient's devices concurrently", async () => {
		const t = convexTest(schema, modules);
		let releaseSlow: (() => void) | undefined;
		const sender = vi.fn<PushSender>((subscription) =>
			subscription.endpoint === "https://push/1"
				? new Promise<void>((resolve) => {
						releaseSlow = resolve;
					})
				: Promise.resolve()
		);
		setPushSenderForTests(sender);
		stubVapid();
		const pending = t.action(internal.notify.channels.push.send, {
			subscriptions: [
				{ endpoint: "https://push/1", p256dh: "p", auth: "a" },
				{ endpoint: "https://push/2", p256dh: "p", auth: "a" },
			],
			message: MESSAGE,
		});
		await vi.waitFor(() => {
			expect(sender).toHaveBeenCalledTimes(2);
		});
		releaseSlow?.();
		expect(await pending).toEqual({ delivered: 2, failed: 0 });
	});

	it("logs and skips without VAPID keys", async () => {
		const t = convexTest(schema, modules);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		const log = vi
			.spyOn(console, "log")
			.mockImplementation(() => undefined);
		const result = await t.action(internal.notify.channels.push.send, {
			subscriptions: [
				{ endpoint: "https://push/1", p256dh: "p", auth: "a" },
			],
			message: MESSAGE,
		});
		expect(result).toEqual({ delivered: 0, failed: 0 });
		expect(sender).not.toHaveBeenCalled();
		expect(
			log.mock.calls.some((c) => String(c[0]).startsWith("[push]"))
		).toBe(true);
	});
});
