import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { boardLifecycleAlert } from "./emails/generated/boardLifecycleAlert.ts";
import {
	setPushSenderForTests,
	type PushSender,
} from "./notify/channels/pushSender.ts";
import { lifecycleAlert } from "./notify/kinds/lifecycleAlert.ts";
import type { Recipient } from "./notify/types.ts";
import { LIFECYCLE_ALERT_KEY } from "./opsAlerts.ts";
import schema from "./schema.ts";

const dispatchFailure = vi.hoisted(() => ({ failNext: false }));

vi.mock("./notify/notify.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./notify/notify.ts")>();
	return {
		...actual,
		notifyNow: ((...args: Parameters<typeof actual.notifyNow>) => {
			if (dispatchFailure.failNext) {
				dispatchFailure.failNext = false;
				return Promise.reject(new Error("dispatch down"));
			}
			return actual.notifyNow(...args);
		}) as typeof actual.notifyNow,
	};
});

const modules = import.meta.glob("/convex/**/*.*s");
const STEPS = {
	welcome: { completedAt: 1 },
	document: { completedAt: 1 },
	rules: { completedAt: 1 },
	visit: { completedAt: 1 },
};

beforeEach(() => {
	vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
	dispatchFailure.failNext = false;
	setPushSenderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("invariants.healAndScan", () => {
	it("activates a should-be-active guest and reports what is left", async () => {
		const t = convexTest(schema, modules);
		const { stuck } = await t.run(async (ctx) => {
			const now = Date.now();
			const stuck = await ctx.db.insert("people", {
				email: "s@example.com",
				firstName: "S",
				lastName: "Stuck",
				tier: "guest",
				stage: "onboarding",
				stageSince: now,
				onboarding: { steps: STEPS },
			});
			await ctx.db.insert("signatures", {
				personId: stuck,
				email: "s@example.com",
				variant: "guest",
				signedName: "S Stuck",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: now,
			});
			await ctx.db.insert("people", {
				email: "n@example.com",
				firstName: "N",
				lastName: "Nosig",
				tier: "guest",
				stage: "active",
				stageSince: now,
				activatedAt: now,
			});
			return { stuck };
		});
		const result = await t.mutation(internal.invariants.healAndScan, {});
		expect(result.healed).toBe(1);
		expect((await t.run((ctx) => ctx.db.get(stuck)))?.stage).toBe("active");
		expect(result.found.map((f) => `${f.name}:${f.code}`)).toEqual([
			"N Nosig:active-without-agreement",
		]);
	});

	it("does not activate a guest whose window already closed", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const id = await t.run(async (ctx) => {
			const id = await ctx.db.insert("people", {
				email: "p@example.com",
				firstName: "P",
				lastName: "Past",
				tier: "guest",
				stage: "onboarding",
				stageSince: now,
				accessUntil: now - 1000,
				onboarding: { steps: STEPS },
			});
			await ctx.db.insert("signatures", {
				personId: id,
				email: "p@example.com",
				variant: "guest",
				signedName: "P Past",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: now,
			});
			return id;
		});
		const result = await t.mutation(internal.invariants.healAndScan, {});
		expect(result.healed).toBe(0);
		expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe(
			"onboarding"
		);
		expect(result.found.map((f) => f.code)).toContain("live-past-window");
	});

	it("does not activate a member who kept a closed guest window", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		const id = await t.run(async (ctx) => {
			const id = await ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Past",
				tier: "member",
				stage: "onboarding",
				stageSince: now,
				accessUntil: now - 1000,
				onboarding: { steps: STEPS },
			});
			await ctx.db.insert("signatures", {
				personId: id,
				email: "m@example.com",
				variant: "member",
				signedName: "M Past",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: now,
			});
			return id;
		});
		const result = await t.mutation(internal.invariants.healAndScan, {});
		expect(result.healed).toBe(0);
		expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe(
			"onboarding"
		);
		expect(result.found.map((f) => f.code).sort()).toEqual([
			"live-past-window",
			"should-be-active",
		]);
	});

	it("finds nothing on a clean table", async () => {
		const t = convexTest(schema, modules);
		const result = await t.mutation(internal.invariants.healAndScan, {});
		expect(result).toEqual({ healed: 0, found: [] });
	});
});

describe("invariants.check", () => {
	const KEY = LIFECYCLE_ALERT_KEY;

	async function boardWithPush() {
		vi.stubEnv("SITE_URL", "https://app.example.com");
		vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
		vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
		vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
		const t = convexTest(schema, modules);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "b@example.org",
				firstName: "B",
				lastName: "O",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				notificationPrefs: {
					applications: { push: true, email: false },
				},
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

	function addUnsignedGuest(t: TestConvex<typeof schema>, email: string) {
		return t.run((ctx) =>
			ctx.db.insert("people", {
				email,
				firstName: "N",
				lastName: email,
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
			})
		);
	}

	function claimRow(t: TestConvex<typeof schema>) {
		return t.run((ctx) =>
			ctx.db
				.query("opsAlerts")
				.withIndex("by_key", (q) => q.eq("key", KEY))
				.unique()
		);
	}

	it("claims the alert with a sorted, deterministic fingerprint", async () => {
		const t = await boardWithPush();
		setPushSenderForTests(() => Promise.resolve());
		const ids = [
			await addUnsignedGuest(t, "a@example.com"),
			await addUnsignedGuest(t, "b@example.com"),
		];
		const result = await t.action(internal.invariants.check, {});
		expect(result.violations).toBe(2);
		const expected = ids
			.map((id) => `active-without-agreement:${id}`)
			.sort((a, b) => a.localeCompare(b))
			.join(",");
		expect((await claimRow(t))?.fingerprint).toBe(expected);

		const again = await t.action(internal.invariants.check, {});
		expect(again.decision).toBe("silent");
	});

	it("releases the claim when nothing was delivered, then retries", async () => {
		const t = await boardWithPush();
		await addUnsignedGuest(t, "a@example.com");
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		await t.action(internal.invariants.check, {});
		expect((await claimRow(t))?.lastSentAt).toBe(0);

		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		await t.action(internal.invariants.check, {});
		expect(sender).toHaveBeenCalledOnce();
		expect((await claimRow(t))?.lastSentAt).toBeGreaterThan(0);
	});

	it("releases the claim when dispatch throws, then retries", async () => {
		const t = await boardWithPush();
		await addUnsignedGuest(t, "a@example.com");
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		dispatchFailure.failNext = true;
		await expect(t.action(internal.invariants.check, {})).rejects.toThrow(
			"dispatch down"
		);
		expect((await claimRow(t))?.lastSentAt).toBe(0);
		expect(sender).not.toHaveBeenCalled();

		await t.action(internal.invariants.check, {});
		expect(sender).toHaveBeenCalledOnce();
	});

	it("sends an all-clear once when a recorded violation is gone", async () => {
		const t = await boardWithPush();
		await t.run((ctx) =>
			ctx.db.insert("opsAlerts", {
				key: KEY,
				fingerprint: "active-without-agreement:gone",
				lastSentAt: 1,
			})
		);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		const result = await t.action(internal.invariants.check, {});
		expect(result.decision).toBe("resolved");
		expect(sender).toHaveBeenCalledOnce();
		expect(sender.mock.calls[0][1]).toContain(
			"Every person's status is consistent again"
		);
		expect((await claimRow(t))?.fingerprint).toBe("");

		await t.action(internal.invariants.check, {});
		expect(sender).toHaveBeenCalledOnce();
	});
});

const BOARD: Recipient = {
	personId: "b1" as Id<"people">,
	email: "b@example.org",
	firstName: "B",
	tier: "board",
	prefs: undefined,
};

function emailOf(
	payload: Parameters<NonNullable<typeof lifecycleAlert.email>>[0]
) {
	const mail = lifecycleAlert.email?.(payload, BOARD);
	if (!mail) throw new Error("lifecycleAlert sent no email");
	return mail;
}

describe("lifecycleAlert email", () => {
	it("gives each person their own escaped paragraph linking their drawer", () => {
		vi.stubEnv("SITE_URL", "https://app.example.com");
		const mail = emailOf({
			headline: "2 people have an inconsistent status",
			items: [
				{
					personId: "p1",
					name: "A <b>",
					code: "active-without-agreement",
					detail: "needs guest, has none",
				},
				{
					personId: "p2",
					name: "C",
					code: "duplicate-email",
					detail: "c@example.com",
				},
			],
			tag: "t",
		});
		expect(mail.html).toContain(
			'<a href="https://app.example.com/community?person=p1">A &lt;b&gt;</a>: active-without-agreement'
		);
		expect(mail.html).toContain(
			"https://app.example.com/community?person=p2"
		);
		expect(mail.html.match(/<p style="margin:0 0 12px">/g)).toHaveLength(2);
		expect(mail.text).toContain(
			"C: duplicate-email (c@example.com) https://app.example.com/community?person=p2"
		);
	});

	it("cannot be broken out of the href or text by a quote in a value", () => {
		vi.stubEnv("SITE_URL", "https://app.example.com");
		const mail = emailOf({
			headline: "h",
			items: [
				{
					personId: 'p1" onclick="x',
					name: '"><script>',
					code: "c",
					detail: "d",
				},
			],
			tag: "t",
		});
		expect(mail.html).not.toContain('"><script>');
		expect(mail.html).not.toContain('onclick="x');
		expect(mail.html).toContain("&quot;&gt;&lt;script&gt;");
		expect(mail.text).toContain('"><script>: c (d)');
	});

	it("escapes a quote inside the href itself", () => {
		// `personUrl` percent-encodes the id, so only a raw url reaches the
		// href escaping: call the generated template directly.
		const { html } = boardLifecycleAlert({
			headline: "h",
			rows: [
				{
					name: "n",
					url: 'https://x.test/" onclick="steal()',
					code: "c",
					detail: "d",
				},
			],
			communityUrl: "https://x.test",
			manageUrl: "https://x.test/m",
			logoUrl: "https://x.test/l.png",
		});
		expect(html).toContain(
			'<a href="https://x.test/&quot; onclick=&quot;steal()">n</a>'
		);
		expect(html).not.toContain('onclick="steal()');
	});

	it("has no list body on the all-clear push", () => {
		const push = lifecycleAlert.push(
			{ headline: "ok", items: [], tag: "t" },
			BOARD
		);
		expect(push.body).not.toContain("list of people");
	});
});
