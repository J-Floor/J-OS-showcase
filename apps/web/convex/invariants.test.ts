import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedLogin } from "../test-stubs/logins.ts";

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

const dispatchFailure = vi.hoisted(() => ({
	failNext: false,
	sent: [] as unknown[],
}));

vi.mock("./notify/notify.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./notify/notify.ts")>();
	return {
		...actual,
		notifyNow: ((...args: Parameters<typeof actual.notifyNow>) => {
			dispatchFailure.sent.push(args[2]);
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
	vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
	dispatchFailure.failNext = false;
	dispatchFailure.sent.length = 0;
	setPushSenderForTests(undefined);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("invariants.healAndScan", () => {
	it("activates a should-be-active guest and reports what is left", async () => {
		const backend = convexTest(schema, modules);
		const { stuck } = await backend.run(async (context) => {
			const now = Date.now();
			const stuck = await context.db.insert("people", {
				email: "s@example.com",
				firstName: "S",
				lastName: "Stuck",
				tier: "guest",
				stage: "onboarding",
				stageSince: now,
				onboarding: { steps: STEPS },
			});
			await context.db.insert("signatures", {
				personId: stuck,
				email: "s@example.com",
				variant: "guest",
				signedName: "S Stuck",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: now,
			});
			await context.db.insert("people", {
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
		const result = await backend.mutation(
			internal.invariants.healAndScan,
			{}
		);
		expect(result.healed).toBe(1);
		const person = await backend.run((context) => context.db.get(stuck));
		expect(person?.stage).toBe("active");
		expect(
			result.found.map((finding) => `${finding.name}:${finding.code}`)
		).toEqual(["N Nosig:active-without-agreement"]);
	});

	it("does not activate a guest whose window already closed", async () => {
		const backend = convexTest(schema, modules);
		const now = Date.now();
		const id = await backend.run(async (context) => {
			const id = await context.db.insert("people", {
				email: "p@example.com",
				firstName: "P",
				lastName: "Past",
				tier: "guest",
				stage: "onboarding",
				stageSince: now,
				accessUntil: now - 1000,
				onboarding: { steps: STEPS },
			});
			await context.db.insert("signatures", {
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
		const result = await backend.mutation(
			internal.invariants.healAndScan,
			{}
		);
		expect(result.healed).toBe(0);
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("onboarding");
		expect(result.found.map((finding) => finding.code)).toContain(
			"live-past-window"
		);
	});

	it("does not activate a member who kept a closed guest window", async () => {
		const backend = convexTest(schema, modules);
		const now = Date.now();
		const id = await backend.run(async (context) => {
			const id = await context.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Past",
				tier: "member",
				stage: "onboarding",
				stageSince: now,
				accessUntil: now - 1000,
				onboarding: { steps: STEPS },
			});
			await context.db.insert("signatures", {
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
		const result = await backend.mutation(
			internal.invariants.healAndScan,
			{}
		);
		expect(result.healed).toBe(0);
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("onboarding");
		expect(
			result.found
				.map((finding) => finding.code)
				.sort((first, second) => first.localeCompare(second))
		).toEqual(["live-past-window", "should-be-active"]);
	});

	it("finds nothing on a clean table", async () => {
		const backend = convexTest(schema, modules);
		const result = await backend.mutation(
			internal.invariants.healAndScan,
			{}
		);
		expect(result).toEqual({ healed: 0, found: [] });
	});
});

async function boardWithPush() {
	vi.stubEnv("SITE_URL", "https://app.example.com");
	vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
	vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
	vi.stubEnv("VAPID_SUBJECT", "mailto:board@example.com");
	const backend = convexTest(schema, modules);
	betterAuthTest.register(backend);
	const personId = await backend.run((context) =>
		context.db.insert("people", {
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

function addUnsignedGuest(backend: TestConvex<typeof schema>, email: string) {
	return backend.run((context) =>
		context.db.insert("people", {
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

describe("invariants.check", () => {
	const KEY = LIFECYCLE_ALERT_KEY;

	function claimRow(backend: TestConvex<typeof schema>) {
		return backend.run((context) =>
			context.db
				.query("opsAlerts")
				.withIndex("by_key", (range) => range.eq("key", KEY))
				.unique()
		);
	}

	async function claimFingerprint(backend: TestConvex<typeof schema>) {
		const claim = await claimRow(backend);
		return claim?.fingerprint;
	}

	async function claimLastSentAt(backend: TestConvex<typeof schema>) {
		const claim = await claimRow(backend);
		return claim?.lastSentAt;
	}

	it("claims the alert with a sorted, deterministic fingerprint", async () => {
		const backend = await boardWithPush();
		setPushSenderForTests(() => Promise.resolve());
		const ids = [
			await addUnsignedGuest(backend, "a@example.com"),
			await addUnsignedGuest(backend, "b@example.com"),
		];
		const result = await backend.action(internal.invariants.check, {});
		expect(result.violations).toBe(2);
		const expected = ids
			.map((id) => `active-without-agreement:${id}`)
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => a.localeCompare(b))
			.join(",");
		expect(await claimFingerprint(backend)).toBe(expected);

		const again = await backend.action(internal.invariants.check, {});
		expect(again.decision).toBe("silent");
	});

	it("releases the claim when nothing was delivered, then retries", async () => {
		const backend = await boardWithPush();
		await addUnsignedGuest(backend, "a@example.com");
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		setPushSenderForTests(() =>
			Promise.reject(new Error("push service down"))
		);
		await backend.action(internal.invariants.check, {});
		expect(await claimLastSentAt(backend)).toBe(0);

		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		await backend.action(internal.invariants.check, {});
		expect(sender).toHaveBeenCalledOnce();
		expect(await claimLastSentAt(backend)).toBeGreaterThan(0);
	});

	it("releases the claim when dispatch throws, then retries", async () => {
		const backend = await boardWithPush();
		await addUnsignedGuest(backend, "a@example.com");
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		dispatchFailure.failNext = true;
		await expect(
			backend.action(internal.invariants.check, {})
		).rejects.toThrow("dispatch down");
		expect(await claimLastSentAt(backend)).toBe(0);
		expect(sender).not.toHaveBeenCalled();

		await backend.action(internal.invariants.check, {});
		expect(sender).toHaveBeenCalledOnce();
	});

	it("sends an all-clear once when a recorded violation is gone", async () => {
		const backend = await boardWithPush();
		await backend.run((context) =>
			context.db.insert("opsAlerts", {
				key: KEY,
				fingerprint: "active-without-agreement:gone",
				lastSentAt: 1,
			})
		);
		const sender = vi.fn<PushSender>(() => Promise.resolve());
		setPushSenderForTests(sender);
		const result = await backend.action(internal.invariants.check, {});
		expect(result.decision).toBe("resolved");
		expect(sender).toHaveBeenCalledOnce();
		expect(sender.mock.calls[0][1]).toContain(
			"Every person's status is consistent again"
		);
		expect(await claimFingerprint(backend)).toBe("");

		await backend.action(internal.invariants.check, {});
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
	it("gives each person their own escaped paragraph linking their sheet", () => {
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

function setup() {
	const backend = convexTest(schema, modules);
	betterAuthTest.register(backend);
	rateLimiterTest.register(backend);
	return backend;
}

async function seedMember(
	backend: ReturnType<typeof setup>,
	email: string,
	authUserId?: string
) {
	const now = Date.now();
	await backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "L",
			lastName: "Linked",
			tier: "member",
			stage: "active",
			stageSince: now,
			activatedAt: now,
			...(authUserId === undefined ? {} : { authUserId }),
		})
	);
}

type Alert = { items: { code: string; detail: string }[] };

async function mismatches(backend: ReturnType<typeof setup>) {
	dispatchFailure.sent.length = 0;
	await backend.action(internal.invariants.check, {});
	const alert = dispatchFailure.sent.at(-1) as Alert | undefined;
	if (!alert) throw new Error("the check sent no alert");
	return alert.items.filter((item) => item.code === "login-email-mismatch");
}

describe("invariants.check login links", () => {
	it("finds a person whose login carries another email, without naming addresses", async () => {
		const backend = setup();
		const login = await seedLogin(backend, "old@example.com");
		await seedMember(backend, "new@example.com", login);
		const found = await mismatches(backend);
		expect(found).toHaveLength(1);
		expect(found[0]?.detail).toBe("login email differs");
		expect(JSON.stringify(dispatchFailure.sent)).not.toContain(
			"example.com"
		);
	});

	it("finds a person linked to a login that is gone", async () => {
		const backend = setup();
		await seedMember(backend, "gone@example.com", "no-such-login");
		const found = await mismatches(backend);
		expect(found).toHaveLength(1);
		expect(found[0]?.detail).toBe("login missing");
	});

	it("does not find a matching link, whatever the case, or an unlinked person", async () => {
		const backend = setup();
		const login = await seedLogin(backend, "Match@Example.com");
		await seedMember(backend, "match@example.com", login);
		await seedMember(backend, "free@example.com");
		expect(await mismatches(backend)).toEqual([]);
	});

	it("reads every page of logins and people", async () => {
		const backend = setup();
		const OVER_ONE_PAGE = 101;
		for (let index = 0; index < OVER_ONE_PAGE; index++) {
			const email = `p${String(index)}@example.com`;
			await seedMember(backend, email, await seedLogin(backend, email));
		}
		await seedMember(backend, "late@example.com", "no-such-login");
		const found = await mismatches(backend);
		expect(found.map((item) => item.detail)).toEqual(["login missing"]);
	});
});
