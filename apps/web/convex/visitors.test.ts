import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubRecaptcha } from "../test-stubs/stubRecaptcha.ts";

import { api, internal } from "./_generated/api";
import { settlePendingEvent } from "./lib/attendance.ts";
import { hashConfirmToken, issueToken } from "./lib/confirmToken.ts";
import {
	EMAIL_LIMIT_COUNT,
	PUBLIC_SUBMIT_PER_HOUR,
	rateLimiter,
} from "./lib/rateLimit.ts";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

// Helpers below take the tester as a parameter. Capture its fully-typed shape
// from a real call: a bare `ReturnType<typeof convexTest>` drops the schema, so
// `ctx.db` inside `t.run` loses the `people` indexes and fields.
//
// `registerVisitor` now consumes a `rateLimiter.limit` token on every call, so
// every tester built here must have the component registered — otherwise the
// action throws for tests that never intended to exercise rate limiting.
function createTester() {
	const backend = convexTest(schema, modules);
	registerRateLimiter(backend);
	return backend;
}
type Tester = ReturnType<typeof createTester>;

const BOARD_EMAIL = "boss@example.com";

async function seedBoard(backend: Tester) {
	const boardId = await backend.run(async (context) =>
		context.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { boardId, asBoard: backend.withIdentity({ email: BOARD_EMAIL }) };
}

async function seedEvent(backend: Tester) {
	const { asBoard } = await seedBoard(backend);
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
async function seedEndedEvent(backend: Tester) {
	const { asBoard } = await seedBoard(backend);
	return asBoard.mutation(api.events.createEvent, {
		name: "Ended Hack Night",
		startsAtLocal: zonedLocalFromEpoch(Date.now() - 200_000, SITE_TIMEZONE),
		endsAtLocal: zonedLocalFromEpoch(Date.now() - 1000, SITE_TIMEZONE),
	});
}

function passFetch() {
	stubRecaptcha({ success: true, action: "visitor", score: 0.9 });
}

const VISITOR_INPUT = {
	firstName: "Vera",
	lastName: "Visitor",
	email: "vera@example.com",
	token: "x",
};

describe("registerVisitor", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("throws a distinct error when the reCAPTCHA secret is not configured", async () => {
		delete process.env.RECAPTCHA_SECRET;
		const backend = createTester();
		const eventId = await seedEvent(backend);
		await expect(
			backend.action(api.visitors.registerVisitor, {
				...VISITOR_INPUT,
				eventId,
			})
		).rejects.toThrow("reCAPTCHA is not configured");
		const all = await backend.run((context) =>
			context.db.query("people").collect()
		);
		// Only the seeded board member — no visitor row written.
		expect(all).toHaveLength(1);
	});

	it("the global publicSubmit cap, checked after reCAPTCHA passes, answers pending, warns and writes nothing", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		for (let index = 0; index < PUBLIC_SUBMIT_PER_HOUR; index++) {
			await backend.run((context) =>
				rateLimiter.limit(context, "publicSubmit")
			);
		}
		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});
		expect(result).toEqual({ status: "pending" });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		const all = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(1);
	});

	it("an unreachable reCAPTCHA is RecaptchaUnavailable, not a failed check, and writes nothing", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(new Error("network down")))
		);
		const backend = createTester();
		const eventId = await seedEvent(backend);
		await expect(
			backend.action(api.visitors.registerVisitor, {
				...VISITOR_INPUT,
				eventId,
			})
		).rejects.toThrow("RecaptchaUnavailable");
		const all = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(all).toHaveLength(1);
	});

	it("a failed reCAPTCHA does not spend the global publicSubmit cap", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		stubRecaptcha({ success: false, action: "visitor", score: 0 });
		const backend = createTester();
		const eventId = await seedEvent(backend);
		for (let index = 0; index < PUBLIC_SUBMIT_PER_HOUR - 1; index++) {
			await backend.run((context) =>
				rateLimiter.limit(context, "publicSubmit")
			);
		}
		await expect(
			backend.action(api.visitors.registerVisitor, {
				...VISITOR_INPUT,
				eventId,
			})
		).rejects.toThrow("RecaptchaFailed");
		const { ok } = await backend.run((context) =>
			rateLimiter.limit(context, "publicSubmit")
		);
		expect(ok).toBe(true);
	});

	it("new email creates a visitor/unverified person with a visitor confirm token for the event, and sends the confirm email", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();

		expect(result).toEqual({ status: "pending" });
		const doc = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VISITOR_INPUT.email)
				)
				.unique()
		);
		expect(doc?.tier).toBe("visitor");
		expect(doc?.stage).toBe("unverified");
		expect(doc?.verifiedAt).toBeUndefined();
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			purpose: "visitor",
			personId: doc?._id,
			eventId,
		});
		expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
		// Sent by name — the devLog fallback since no RESEND_API_KEY in tests.
		expect(
			logs.some((message) => message.includes("[verify-visitor]"))
		).toBe(true);
	});

	// The former "already-registered" behaviour (write nothing, distinct
	// status) is now covered by the "registerVisitor sends the right email for
	// the right tier" describe block below: a non-visitor gets a neutral
	// `{ status: "pending" }` and an `eventInvite` row, with the people row
	// left untouched.

	it("resends for an existing unverified visitor: token changes, still exactly one row and one live token", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const firstResult = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});
		expect(firstResult).toEqual({ status: "pending" });
		const first = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(first).toHaveLength(1);

		const secondResult = await backend.action(
			api.visitors.registerVisitor,
			{
				...VISITOR_INPUT,
				eventId,
			}
		);
		expect(secondResult).toEqual({ status: "pending" });

		const rows = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VISITOR_INPUT.email)
				)
				.collect()
		);
		expect(rows).toHaveLength(1);
		const second = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(second).toHaveLength(1);
		expect(second[0].tokenHash).not.toBe(first[0].tokenHash);
		expect(rows[0].tier).toBe("visitor");
		expect(rows[0].stage).toBe("unverified");
	});

	it("rejects malformed input server-side (bad email) and writes nothing", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		await expect(
			backend.action(api.visitors.registerVisitor, {
				...VISITOR_INPUT,
				email: "not-an-email",
				eventId,
			})
		).rejects.toThrow("InvalidEmail");
		const all = await backend.run((context) =>
			context.db.query("people").collect()
		);
		// Only the seeded board member — no visitor row from the bad input.
		expect(all).toHaveLength(1);
	});

	it("caps names at 200 characters", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		await expect(
			backend.action(api.visitors.registerVisitor, {
				...VISITOR_INPUT,
				firstName: "a".repeat(201),
				eventId,
			})
		).rejects.toThrow("FirstNameRequired");
		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			firstName: "a".repeat(200),
			eventId,
		});
		expect(result).toEqual({ status: "pending" });
	});

	it("returns no-event for a missing event", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		// Create then delete an event to get a validly-typed but non-existent id.
		const eventId = await seedEvent(backend);
		await backend.run((context) => context.db.delete(eventId));

		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});
		expect(result).toEqual({ status: "no-event" });
		const all = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VISITOR_INPUT.email)
				)
				.collect()
		);
		expect(all).toHaveLength(0);
	});

	it("throttles a burst of visitor emails to one address, but still returns pending", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const args = {
			eventId,
			firstName: "V",
			lastName: "X",
			email: "burst@example.org",
			token: "captcha",
		};

		// EMAIL_LIMIT_COUNT allowed, one more throttled — all return "pending".
		for (let index = 0; index <= EMAIL_LIMIT_COUNT; index++) {
			const result = await backend.action(
				api.visitors.registerVisitor,
				args
			);
			expect(result).toEqual({ status: "pending" });
		}

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		// Only EMAIL_LIMIT_COUNT verify-visitor sends actually went out — the
		// devLog fallback fires once per real send, so the throttled call must
		// not add an extra line.
		expect(
			logs.filter((message) => message.includes("[verify-visitor]"))
		).toHaveLength(EMAIL_LIMIT_COUNT);
	});

	it("a different address in the same window is unaffected by another address's throttling", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);

		// Exhaust the limit for one address.
		for (let index = 0; index < 4; index++) {
			await backend.action(api.visitors.registerVisitor, {
				eventId,
				firstName: "V",
				lastName: "X",
				email: "burst2@example.org",
				token: "captcha",
			});
		}

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(api.visitors.registerVisitor, {
			eventId,
			firstName: "Other",
			lastName: "Person",
			email: "unaffected@example.org",
			token: "captcha",
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();

		expect(result).toEqual({ status: "pending" });
		expect(
			logs.some((message) =>
				message.includes("[verify-visitor] unaffected@example.org")
			)
		).toBe(true);
	});

	it("throttles a burst of event-invite emails (non-visitor tier) the same way", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const email = "member-burst@example.org";
		await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "M",
				lastName: "Burst",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const args = {
			eventId,
			firstName: "M",
			lastName: "Burst",
			email,
			token: "captcha",
		};

		// A non-visitor takes the `eventInvite` send branch, not
		// `verifyVisitor` — confirm the SAME gate throttles it too, not just
		// the visitor branch.
		for (let index = 0; index <= EMAIL_LIMIT_COUNT; index++) {
			const result = await backend.action(
				api.visitors.registerVisitor,
				args
			);
			expect(result).toEqual({ status: "pending" });
		}

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();
		expect(
			logs.filter((message) => message.includes("[event-invite]"))
		).toHaveLength(EMAIL_LIMIT_COUNT);
	});
});

describe("registerVisitor: typed text never reaches an inbox", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
		delete process.env.RESEND_API_KEY;
	});

	const typed = {
		...VISITOR_INPUT,
		firstName: "Mallory URGENT pay https://evil.example/pay",
		lastName: "Attacker",
	};
	const SUBMITTED = ["Mallory", "Attacker", "URGENT", "evil.example"];

	async function registerAgainst(
		existing: { tier: "visitor" | "member"; firstName: string } | null
	) {
		process.env.RECAPTCHA_SECRET = "secret";
		process.env.RESEND_API_KEY = "re_test";
		const fetchMock = stubRecaptcha({
			success: true,
			action: "visitor",
			score: 0.9,
		});
		const backend = createTester();
		const eventId = await seedEvent(backend);
		if (existing) {
			await backend.run(async (context) =>
				context.db.insert("people", {
					email: VISITOR_INPUT.email,
					lastName: "",
					stage: "active",
					stageSince: Date.now(),
					...existing,
				})
			);
		}
		await backend.action(api.visitors.registerVisitor, {
			...typed,
			eventId,
		});
		const calls = fetchMock.mock.calls as unknown as [
			string,
			{ body: string },
		][];
		const sent = calls
			.filter(([url]) => url.startsWith("https://api.resend.com/"))
			.map(([, init]) => init.body);
		expect(sent).toHaveLength(1);
		return JSON.parse(sent[0]) as {
			subject: string;
			html: string;
			text: string;
		};
	}

	function expectNoSubmittedText(mail: { html: string; text: string }) {
		for (const word of SUBMITTED) {
			expect(mail.html).not.toContain(word);
			expect(mail.text).not.toContain(word);
		}
	}

	it("verify-visitor email to a new address", async () => {
		const mail = await registerAgainst(null);
		expect(mail.subject).toBe("Confirm your email for J floor Wi-Fi");
		expectNoSubmittedText(mail);
	});

	it("event-invite email to an existing member's confirmed inbox", async () => {
		const mail = await registerAgainst({
			tier: "member",
			firstName: "Grace",
		});
		expect(mail.subject).toBe("You're set for the J floor event");
		expect(mail.html).toContain("Hack Night");
		expectNoSubmittedText(mail);
	});
});

describe("registerVisitor: event has ended", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("returns ended and writes no person row or email for an event whose endsAt has passed", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEndedEvent(backend);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});

		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();

		expect(result).toEqual({ status: "ended" });
		const all = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VISITOR_INPUT.email)
				)
				.collect()
		);
		expect(all).toHaveLength(0);
		expect(
			logs.some((message) => message.includes("[verify-visitor]"))
		).toBe(false);
	});

	it("does not consume the per-address rate limit: a follow-up register for an open event still sends", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		// Seed the board identity once — seedEvent/seedEndedEvent each seed
		// their own board row, and two rows sharing BOARD_EMAIL breaks the
		// by_email .unique() lookups elsewhere in the app.
		const { asBoard } = await seedBoard(backend);
		const endedEventId = await asBoard.mutation(api.events.createEvent, {
			name: "Ended Hack Night",
			startsAtLocal: zonedLocalFromEpoch(
				Date.now() - 200_000,
				SITE_TIMEZONE
			),
			endsAtLocal: zonedLocalFromEpoch(Date.now() - 1000, SITE_TIMEZONE),
		});
		const openEventId = await asBoard.mutation(api.events.createEvent, {
			name: "Hack Night",
			startsAtLocal: zonedLocalFromEpoch(Date.now(), SITE_TIMEZONE),
			endsAtLocal: zonedLocalFromEpoch(
				Date.now() + 86_400_000,
				SITE_TIMEZONE
			),
		});

		const first = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId: endedEventId,
		});
		expect(first).toEqual({ status: "ended" });

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const second = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId: openEventId,
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();

		expect(second).toEqual({ status: "pending" });
		expect(
			logs.some((message) => message.includes("[verify-visitor]"))
		).toBe(true);
	});
});

describe("throttle does not clobber the armed token", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("a throttled visitor re-register leaves the armed people row byte-identical (no token clobber)", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const args = {
			eventId,
			firstName: "V",
			lastName: "X",
			email: "clobber@example.org",
			token: "captcha",
		};

		// Exhaust the per-address limit with real, delivered sends.
		for (let index = 0; index < EMAIL_LIMIT_COUNT; index++) {
			expect(
				await backend.action(api.visitors.registerVisitor, args)
			).toEqual({
				status: "pending",
			});
		}
		const armed = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "clobber@example.org")
				)
				.unique()
		);

		// One more submit is throttled. It must NOT re-arm the token: the last
		// DELIVERED email's link stays valid because no replacement is sent.
		// (Old code armed a fresh token via insertOrResendVisitor and THEN
		// found the send throttled, locking the user out.)
		expect(
			await backend.action(api.visitors.registerVisitor, args)
		).toEqual({
			status: "pending",
		});
		const after = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "clobber@example.org")
				)
				.unique()
		);
		expect(after).toEqual(armed);
	});

	it("a throttled non-visitor re-register leaves the armed eventInvite token untouched (no invite clobber)", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const email = "member-clobber@example.org";
		await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "M",
				lastName: "Clobber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const args = {
			eventId,
			firstName: "M",
			lastName: "Clobber",
			email,
			token: "captcha",
		};

		for (let index = 0; index < EMAIL_LIMIT_COUNT; index++) {
			expect(
				await backend.action(api.visitors.registerVisitor, args)
			).toEqual({
				status: "pending",
			});
		}
		const armed = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(armed).toHaveLength(1);

		// Throttled: issueToken's replace-the-prior-token delete must not run,
		// or it would drop the live invite token and send no replacement — the
		// same clobber as the visitor branch.
		expect(
			await backend.action(api.visitors.registerVisitor, args)
		).toEqual({
			status: "pending",
		});
		const after = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(after).toEqual(armed);
	});
});

// Only the token's hash is stored, so the raw token is read from the link
// in the email that was sent (the stubbed fetch to the mail provider).
async function registerAndGetToken(backend: Tester) {
	process.env.RECAPTCHA_SECRET = "secret";
	process.env.RESEND_API_KEY = "test-key";
	const fetchMock = stubRecaptcha({
		success: true,
		action: "visitor",
		score: 0.9,
	});
	const eventId = await seedEvent(backend);
	await backend.action(api.visitors.registerVisitor, {
		...VISITOR_INPUT,
		eventId,
	});
	const calls = fetchMock.mock.calls as unknown as [
		string,
		{ body: string },
	][];
	const sent = calls.find(([url]) =>
		url.startsWith("https://api.resend.com/")
	);
	const token = sent
		? /token=([0-9a-f]{64})/.exec(
				(JSON.parse(sent[1].body) as { html: string }).html
			)?.[1]
		: undefined;
	if (!token) throw new Error("no confirm link emailed");
	const row = await backend.run((context) =>
		context.db.query("confirmTokens").first()
	);
	if (!row) throw new Error("no confirm token");
	return { eventId, token, id: row.personId };
}

describe("confirmVisitor", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
		delete process.env.RESEND_API_KEY;
	});

	it("flips a valid token to verified, writes exactly one attendance row, returns wifi, and dispatches NO lifecycle event", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const { eventId, token, id } = await registerAndGetToken(backend);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token,
		});

		expect(result).toEqual({
			status: "verified",
			wifi: { ssid: "Test Net", password: "test-wifi-password" },
			who: {
				firstName: "Vera",
				lastName: "Visitor",
				email: "vera@example.com",
			},
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("verified");
		expect(person?.verifiedAt).toBeTypeOf("number");

		const attendance = await backend.run((context) =>
			context.db
				.query("eventAttendance")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(attendance).toHaveLength(1);
		expect(attendance[0].eventId).toBe(eventId);

		// The regression guard: no lifecycle job (seeding the event itself
		// schedules its own `notify/eventReminders:*` jobs, which are unrelated). If someone
		// wires this up to `applyEvent`/`VERIFY_EMAIL` — which emails the whole
		// board — this assertion goes red.
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(
			jobs.filter((job) => !job.name.startsWith("notify/eventReminders:"))
		).toHaveLength(0);
	});

	it("returns already (with wifi) on a second click of the same link, without a second attendance row", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const { token, id } = await registerAndGetToken(backend);

		const first = await backend.action(api.visitors.confirmVisitor, {
			token,
		});
		expect(first.status).toBe("verified");

		const second = await backend.action(api.visitors.confirmVisitor, {
			token,
		});
		expect(second).toEqual({
			status: "already",
			wifi: { ssid: "Test Net", password: "test-wifi-password" },
			who: {
				firstName: "Vera",
				lastName: "Visitor",
				email: "vera@example.com",
			},
		});

		const attendance = await backend.run((context) =>
			context.db
				.query("eventAttendance")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(attendance).toHaveLength(1);
	});

	it("returns expired for a token past its expiry", async () => {
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "old@example.com",
				firstName: "Old",
				lastName: "Visitor",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "signup",
				door: { override: "none" },
				board: {},
				submittedAt: Date.now(),
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "stale-token",
				purpose: "visitor",
				personId,
				eventId,
				ttlMs: -1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "stale-token",
		});
		expect(result).toEqual({ status: "expired" });
	});

	it("returns invalid for an unknown token", async () => {
		const backend = createTester();
		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "does-not-exist",
		});
		expect(result).toEqual({ status: "invalid" });
	});

	it("treats a deleted event as over: no Wi-Fi, no verification, NO attendance row", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const { eventId, token, id } = await registerAndGetToken(backend);

		// The event is deleted between registration and this confirm click (e.g.
		// events.deleteEvent ran). The stale confirm link must not recreate an
		// orphan attendance row for a non-existent event, nor hand out Wi-Fi.
		await backend.run((context) => context.db.delete(eventId));

		const result = await backend.action(api.visitors.confirmVisitor, {
			token,
		});

		expect(result).toEqual({
			status: "ended",
			who: {
				firstName: "Vera",
				lastName: "Visitor",
				email: "vera@example.com",
			},
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("unverified");
		expect(person?.verifiedAt).toBeUndefined();

		const attendance = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(attendance).toEqual([]);
	});

	it("returns invalid for a non-visitor person's token (e.g. an applicant's verify link)", async () => {
		const backend = createTester();
		const adaId = await backend.run((context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "app-token",
				purpose: "application",
				personId: adaId,
				ttlMs: 1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "app-token",
		});
		expect(result).toEqual({ status: "invalid" });
	});

	it("returns the board-edited Wi-Fi credentials once the wifiConfig row has been written", async () => {
		const backend = createTester();
		const { token } = await registerAndGetToken(backend);
		// The stale fallback the fixture above pins — proves the edited row is
		// actually preferred, not just coincidentally equal to it.
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Board Edited SSID",
				password: "board-edited-pass",
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token,
		});

		expect(result).toEqual({
			status: "verified",
			wifi: { ssid: "Board Edited SSID", password: "board-edited-pass" },
			who: {
				firstName: "Vera",
				lastName: "Visitor",
				email: "vera@example.com",
			},
		});
	});
});

describe("confirmVisitor: pending event has ended", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("returns ended with no wifi and writes no attendance when the pending event's endsAt has passed", async () => {
		const backend = createTester();
		const eventId = await seedEndedEvent(backend);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "vera-ended@example.com",
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "signup",
				door: { override: "none" },
				board: {},
				submittedAt: Date.now(),
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "ended-tok",
				purpose: "visitor",
				personId: id,
				eventId,
				ttlMs: 1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "ended-tok",
		});

		expect(result).toEqual({
			status: "ended",
			who: {
				firstName: "Vera",
				lastName: "Visitor",
				email: "vera-ended@example.com",
			},
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("unverified");
		expect(person?.verifiedAt).toBeUndefined();

		const attendance = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(attendance).toEqual([]);
	});

	it("returns ended (no wifi) even for an already-verified visitor whose new pending event has ended", async () => {
		const backend = createTester();
		const eventId = await seedEndedEvent(backend);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "vera2-ended@example.com",
				firstName: "Vera2",
				lastName: "Visitor2",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: 5,
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "ended-tok-2",
				purpose: "visitor",
				personId: id,
				eventId,
				ttlMs: 1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "ended-tok-2",
		});

		expect(result).toEqual({
			status: "ended",
			who: {
				firstName: "Vera2",
				lastName: "Visitor2",
				email: "vera2-ended@example.com",
			},
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.verifiedAt).toBe(5);

		const attendance = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(attendance).toEqual([]);
	});

	it("still confirms normally (no ended status) when the pending event's endsAt is still in the future", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const eventId = await seedEvent(backend);
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email: "vera-open@example.com",
				firstName: "Vera",
				lastName: "Open",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "signup",
				door: { override: "none" },
				board: {},
				submittedAt: Date.now(),
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "open-tok",
				purpose: "visitor",
				personId: id,
				eventId,
				ttlMs: 1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "open-tok",
		});

		expect(result.status).toBe("verified");
		expect(result.wifi).toEqual({
			ssid: "Test Net",
			password: "test-wifi-password",
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("verified");

		const attendance = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(attendance).toHaveLength(1);
	});
});

describe("settlePendingEvent", () => {
	it("inserts attendance at most once per event and consumes the live visitor token", async () => {
		const backend = createTester();
		// Arrange: an event and a verified visitor with a live visitor token for
		// it, plus a pre-existing attendance row for the same (person, event) —
		// simulating a person who already confirmed once.
		const eventId = await seedEvent(backend);
		const personId = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "vera@example.com",
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
			});
			await context.db.insert("eventAttendance", {
				personId,
				eventId,
				confirmedAt: 1,
			});
			await issueToken(context, {
				token: "settle",
				purpose: "visitor",
				personId,
				eventId,
				ttlMs: 1000,
			});
			return personId;
		});

		// Act
		await backend.run((context) => settlePendingEvent(context, personId));

		// Assert: still exactly one attendance row for this event, token spent.
		const rows = await backend.run((context) =>
			context.db
				.query("eventAttendance")
				.withIndex("by_person", (range) =>
					range.eq("personId", personId)
				)
				.collect()
		);
		expect(rows.filter((row) => row.eventId === eventId)).toHaveLength(1);
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].consumedAt).toBeTypeOf("number");
	});

	it("records attendance from a live token and ignores an expired one", async () => {
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const personId = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "vera@example.com",
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
			});
			await issueToken(context, {
				token: "live",
				purpose: "visitor",
				personId,
				eventId,
				ttlMs: 1000,
			});
			return personId;
		});
		await backend.run((context) => settlePendingEvent(context, personId));
		expect(
			await backend.run((context) =>
				context.db.query("eventAttendance").collect()
			)
		).toHaveLength(1);

		const otherEvent = await backend.run(async (context) => {
			const event = await context.db.insert("events", {
				name: "Old",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 0,
			});
			await issueToken(context, {
				token: "dead",
				purpose: "visitor",
				personId,
				eventId: event,
				ttlMs: -1000,
			});
			return event;
		});
		await backend.run((context) => settlePendingEvent(context, personId));
		const rows = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(rows.some((row) => row.eventId === otherEvent)).toBe(false);
	});
});

describe("non-visitor event invite (no clobber of the people row)", () => {
	it("a non-visitor email gets an eventInvite token and never touches the people row", async () => {
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const memberId = await backend.run((context) =>
			context.db.insert("people", {
				email: "m@example.org",
				firstName: "M",
				lastName: "X",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const before = await backend.run((context) => context.db.get(memberId));

		const result = await backend.mutation(
			internal.visitors.insertOrResendVisitor,
			{
				firstName: "M",
				lastName: "X",
				email: "m@example.org",
				eventId,
				token: "inv",
			}
		);

		expect(result.purpose).toBe("eventInvite");
		const after = await backend.run((context) => context.db.get(memberId));
		expect(after).toEqual(before); // people row byte-identical: no clobber

		const invHash = await hashConfirmToken("inv");
		const tokens = await backend.run((context) =>
			context.db
				.query("confirmTokens")
				.withIndex("by_tokenHash", (range) =>
					range.eq("tokenHash", invHash)
				)
				.collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			purpose: "eventInvite",
			personId: memberId,
			eventId,
		});
	});
});

describe("registerVisitor sends the right email for the right tier", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RECAPTCHA_SECRET;
	});

	it("a non-visitor email gets an event-invite email (not the visitor verify email) and an eventInvite token, and returns neutral pending", async () => {
		process.env.RECAPTCHA_SECRET = "secret";
		passFetch();
		const backend = createTester();
		const eventId = await seedEvent(backend);
		await backend.run((context) =>
			context.db.insert("people", {
				email: VISITOR_INPUT.email,
				firstName: "Vera",
				lastName: "Member",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const result = await backend.action(api.visitors.registerVisitor, {
			...VISITOR_INPUT,
			eventId,
		});
		const logs = logSpy.mock.calls.map((call) =>
			call.map(String).join(" ")
		);
		logSpy.mockRestore();

		// Neutral: identical to the brand-new-visitor case, so the response
		// never leaks whether the email is already registered.
		expect(result).toEqual({ status: "pending" });
		const rows = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", VISITOR_INPUT.email)
				)
				.collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].tier).toBe("member");
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({ purpose: "eventInvite", eventId });
		expect(logs.some((message) => message.includes("[event-invite]"))).toBe(
			true
		);
		expect(
			logs.some((message) => message.includes("[verify-visitor]"))
		).toBe(false);
	});
});

describe("repeat visitor (verified visitor attends a new event)", () => {
	it("a verified visitor re-registering for a new event gets a fresh visitor token for it", async () => {
		const backend = createTester();
		const eventB = await seedEvent(backend);
		const email = "v@example.org";
		await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "V",
				lastName: "X",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: 1,
			})
		);

		const result = await backend.mutation(
			internal.visitors.insertOrResendVisitor,
			{
				firstName: "V",
				lastName: "X",
				email,
				eventId: eventB,
				token: "tok-b",
			}
		);

		expect(result.purpose).toBe("visitor");
		const person = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) => range.eq("email", email))
				.unique()
		);
		const tokens = await backend.run((context) =>
			context.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			tokenHash: await hashConfirmToken("tok-b"),
			purpose: "visitor",
			personId: person?._id,
			eventId: eventB,
		});
		// Re-arming must not touch the visitor's existing verified state.
		expect(person?.stage).toBe("verified");
		expect(person?.verifiedAt).toBe(1);
	});

	it("confirmVisitor records attendance for a re-armed verified visitor without resetting verifiedAt", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const eventId = await seedEvent(backend);
		const email = "v@example.org";
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "Vera",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: 5,
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "tok",
				purpose: "visitor",
				personId: id,
				eventId,
				ttlMs: 1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "tok",
		});

		expect(result.status).toBe("verified");
		expect(result.who).toEqual({
			firstName: "Vera",
			lastName: "Visitor",
			email,
		});
		const person = await backend.run((context) => context.db.get(id));
		// The original verifiedAt is preserved — confirmVisitorByToken must not
		// re-stamp an already-verified visitor.
		expect(person?.verifiedAt).toBe(5);

		const rows = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows.some((row) => row.eventId === eventId)).toBe(true);
	});

	it("confirmVisitor on an expired token for an already-verified visitor still grants wifi, without creating attendance", async () => {
		const backend = createTester();
		await backend.run((context) =>
			context.db.insert("wifiConfig", {
				ssid: "Test Net",
				password: "test-wifi-password",
			})
		);
		const eventId = await seedEvent(backend);
		const email = "v2@example.org";
		const id = await backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "Vera2",
				lastName: "Visitor2",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: 5,
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "stale-tok",
				purpose: "visitor",
				personId: id,
				eventId,
				ttlMs: -1000,
			})
		);

		const result = await backend.action(api.visitors.confirmVisitor, {
			token: "stale-tok",
		});

		expect(result).toEqual({
			status: "already",
			wifi: { ssid: "Test Net", password: "test-wifi-password" },
			who: { firstName: "Vera2", lastName: "Visitor2", email },
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.verifiedAt).toBe(5);

		const rows = await backend.run((context) =>
			context.db.query("eventAttendance").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("a used visitor link stops returning Wi-Fi once the event is over", async () => {
		const backend = createTester();
		const eventId = await seedEndedEvent(backend);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "v@example.com",
				firstName: "V",
				lastName: "",
				tier: "visitor",
				stage: "verified",
				stageSince: 0,
				verifiedAt: 1,
			})
		);
		await backend.run((context) =>
			issueToken(context, {
				token: "vt",
				purpose: "visitor",
				personId,
				eventId,
				ttlMs: 1000,
			})
		);
		await backend.run(async (context) => {
			const row = (await context.db.query("confirmTokens").first())!;
			await context.db.patch(row._id, { consumedAt: 1 });
		});
		const result = await backend.mutation(
			internal.visitors.confirmVisitorByToken,
			{
				token: "vt",
			}
		);
		expect(result.status).toBe("ended");
	});
});

describe("invite dedup (per person + event)", () => {
	it("two consecutive non-visitor registrations for the same event leave exactly one live invite token, the newest", async () => {
		const backend = createTester();
		const eventId = await seedEvent(backend);
		const memberId = await backend.run((context) =>
			context.db.insert("people", {
				email: "dup@example.org",
				firstName: "Dup",
				lastName: "Licate",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		for (const token of ["inv-1", "inv-2"]) {
			await backend.mutation(internal.visitors.insertOrResendVisitor, {
				firstName: "Dup",
				lastName: "Licate",
				email: "dup@example.org",
				eventId,
				token,
			});
		}

		const tokens = await backend.run((context) =>
			context.db
				.query("confirmTokens")
				.withIndex("by_person_purpose", (range) =>
					range.eq("personId", memberId).eq("purpose", "eventInvite")
				)
				.collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].tokenHash).toBe(await hashConfirmToken("inv-2"));
	});
});
