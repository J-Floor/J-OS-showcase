import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import schema from "../schema.ts";

import { emailAllowlist, sendEmail, type EmailContext } from "./email.ts";
import {
	setEmailProviderForTests,
	type EmailProvider,
	type SendOutcome,
} from "./emailProvider.ts";

const modules = import.meta.glob("/convex/**/*.*s");

const CONTEXT = {
	runMutation: vi.fn(() => Promise.resolve(true)),
} as unknown as EmailContext;

describe("sendEmail", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.RESEND_API_KEY;
	});

	it("logs the devLog and does not fetch when no API key is set and EMAIL_DEV_LOG=1", async () => {
		delete process.env.RESEND_API_KEY;
		vi.stubEnv("EMAIL_DEV_LOG", "1");
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await sendEmail(CONTEXT, {
			to: "a@example.com",
			subject: "s",
			html: "<p>h</p>",
			text: "h",
			priority: "critical",
			devLog: "[test] hello",
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logSpy.mock.calls.flat().join(" ")).toContain("[test] hello");
		logSpy.mockRestore();
		vi.unstubAllEnvs();
	});

	it("without EMAIL_DEV_LOG logs only recipient and subject when no API key is set", async () => {
		delete process.env.RESEND_API_KEY;
		vi.stubEnv("EMAIL_DEV_LOG", "");
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await sendEmail(CONTEXT, {
			to: "a@example.com",
			subject: "Your link",
			html: "<p>h</p>",
			priority: "critical",
			devLog: "SECRET-URL",
		});
		const logged = logSpy.mock.calls.flat().join(" ");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logged).toContain("a@example.com");
		expect(logged).toContain("Your link");
		expect(logged).not.toContain("SECRET-URL");
		logSpy.mockRestore();
		vi.unstubAllEnvs();
	});

	it("on a provider failure logs recipient and subject, never the devLog", async () => {
		vi.stubEnv("RESEND_API_KEY", "k");
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response("boom", { status: 500 })))
		);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(
			await sendEmail(CONTEXT, {
				to: "a@example.com",
				subject: "Hi",
				html: "<p/>",
				priority: "critical",
				devLog: "SECRET-URL",
			})
		).toBe(false);
		expect(log).not.toHaveBeenCalled();
		expect(err.mock.calls[0][0]).toContain("a@example.com");
		expect(err.mock.calls[0][0]).not.toContain("SECRET-URL");
		vi.unstubAllEnvs();
		log.mockRestore();
		err.mockRestore();
	});
});

function stubResend() {
	vi.stubEnv("RESEND_API_KEY", "re_x");
	const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
	vi.stubGlobal("fetch", fetchSpy);
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	return { fetchSpy, logSpy };
}

describe("EMAIL_ALLOWLIST", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	const message = {
		subject: "Your J floor sign-in link",
		html: "<p>h</p>",
		priority: "critical" as const,
		devLog: "[magic-link] x: https://staging.example.com/link?token=t",
	};

	it("delivers to an allowlisted address, matched case-insensitively and trimmed", async () => {
		vi.stubEnv("EMAIL_ALLOWLIST", " Owner@Example.com , other@example.com");
		const { fetchSpy, logSpy } = stubResend();
		await expect(
			sendEmail(CONTEXT, { to: "owner@EXAMPLE.com ", ...message })
		).resolves.toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("logs the devLog, sign-in link included, for an address not on the list", async () => {
		vi.stubEnv("EMAIL_ALLOWLIST", "owner@example.com");
		const { fetchSpy, logSpy } = stubResend();
		await expect(
			sendEmail(CONTEXT, { to: "stranger@example.com", ...message })
		).resolves.toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(logSpy.mock.calls.flat().join(" ")).toContain(message.devLog);
	});

	it("leaves sending unchanged when unset", async () => {
		const { fetchSpy, logSpy } = stubResend();
		await sendEmail(CONTEXT, { to: "stranger@example.com", ...message });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("parses the list into normalized entries, empty meaning unset", () => {
		vi.stubEnv("EMAIL_ALLOWLIST", " A@Example.com ,, b@example.com ");
		expect(emailAllowlist()).toEqual(["a@example.com", "b@example.com"]);
		vi.stubEnv("EMAIL_ALLOWLIST", "");
		expect(emailAllowlist()).toBeUndefined();
	});
});

function contextFor(backend: ReturnType<typeof convexTest>): EmailContext {
	return {
		runMutation: backend.mutation.bind(backend),
	} as unknown as EmailContext;
}

function setup(
	limits: EmailProvider["limits"],
	outcome: SendOutcome = { kind: "sent" }
) {
	const backend = convexTest(schema, modules);
	const context = contextFor(backend);
	const send = vi.fn(() => Promise.resolve(outcome));
	setEmailProviderForTests({ limits, billing: "perRecipient", send });
	return { backend, context, send };
}

describe("sendEmail quota sync", () => {
	afterEach(() => {
		setEmailProviderForTests(undefined);
		vi.restoreAllMocks();
	});

	it("still resolves true when the post-send quota sync throws", async () => {
		const send = vi.fn(() =>
			Promise.resolve<SendOutcome>({
				kind: "sent",
				usage: { dailyUsed: 3 },
			})
		);
		setEmailProviderForTests({
			limits: { daily: 10, monthly: null },
			billing: "perRecipient",
			send,
		});
		// The reserve call before the send works; the sync after it throws.
		const runMutation = vi
			.fn()
			.mockResolvedValueOnce(true)
			.mockRejectedValueOnce(new Error("db down"));
		const err = vi.spyOn(console, "error").mockImplementation(() => {});

		const isSent = await sendEmail(
			{ runMutation },
			{
				to: "a@example.com",
				subject: "Hi",
				html: "<p>HTML-BODY</p>",
				priority: "critical",
				devLog: "SECRET-URL",
			}
		);

		expect(isSent).toBe(true);
		expect(runMutation).toHaveBeenCalledTimes(2);
		expect(err).toHaveBeenCalledWith("[email] quota sync failed");
		expect(err.mock.calls.flat().join(" ")).not.toContain("a@example.com");
	});
});

describe("sendEmail quota guard", () => {
	afterEach(() => {
		setEmailProviderForTests(undefined);
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	const message = {
		to: "a@example.com",
		subject: "Hi",
		html: "<p>HTML-BODY</p>",
		devLog: "SECRET-URL",
	};

	it("refuses a send past its class ceiling, logging the class and no address", async () => {
		const { context, send } = setup({ daily: 2, monthly: null });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const isFirstSent = await sendEmail(context, {
			...message,
			priority: "notification",
		});
		const isSecondSent = await sendEmail(context, {
			...message,
			priority: "notification",
		});
		expect([isFirstSent, isSecondSent]).toEqual([true, false]);
		expect(send).toHaveBeenCalledTimes(1);
		const logged = warn.mock.calls.flat().join(" ");
		expect(logged).toContain("[email] quota: notification refused");
		expect(logged).not.toContain("a@example.com");
	});

	it("raises the counter to the usage the provider reports", async () => {
		const { context, send } = setup(
			{ daily: 2, monthly: null },
			{ kind: "sent", usage: { dailyUsed: 2 } }
		);
		expect(
			await sendEmail(context, { ...message, priority: "critical" })
		).toBe(true);
		expect(
			await sendEmail(context, { ...message, priority: "critical" })
		).toBe(false);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("fills the window on a quotaExceeded outcome and logs neither devLog nor html", async () => {
		const { context, send } = setup(
			{ daily: 5, monthly: null },
			{ kind: "quotaExceeded", window: "daily" }
		);
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(
			await sendEmail(context, { ...message, priority: "critical" })
		).toBe(false);
		expect(
			await sendEmail(context, { ...message, priority: "critical" })
		).toBe(false);
		expect(send).toHaveBeenCalledTimes(1);
		const logged = err.mock.calls.flat().join(" ");
		expect(logged).toContain("quota exceeded");
		expect(logged).not.toContain("SECRET-URL");
		expect(logged).not.toContain("HTML-BODY");
	});

	it("reserves nothing when no provider is configured", async () => {
		const backend = convexTest(schema, modules);
		const context = contextFor(backend);
		vi.stubEnv("RESEND_API_KEY", "");
		vi.spyOn(console, "log").mockImplementation(() => {});
		expect(
			await sendEmail(context, { ...message, priority: "critical" })
		).toBe(true);
		const rows = await backend.run((context_) =>
			context_.db.query("emailQuota").take(10)
		);
		expect(rows).toHaveLength(0);
	});
});
