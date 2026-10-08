import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email.ts";

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
		await sendEmail({
			to: "a@example.com",
			subject: "s",
			html: "<p>h</p>",
			text: "h",
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
		await sendEmail({
			to: "a@example.com",
			subject: "Your link",
			html: "<p>h</p>",
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

	it("forwards the text field to Resend when an API key is set", async () => {
		process.env.RESEND_API_KEY = "re_x";
		const fetchSpy = vi.fn<
			(url: string, init: { body: string }) => Promise<{ ok: boolean }>
		>(() => Promise.resolve({ ok: true }));
		vi.stubGlobal("fetch", fetchSpy);
		await sendEmail({
			to: "a@example.com",
			subject: "s",
			html: "<p>h</p>",
			text: "h",
			devLog: "[test]",
		});
		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			text?: string;
			html?: string;
		};
		expect(body.text).toBe("h");
		expect(body.html).toBe("<p>h</p>");
	});

	it("forwards attachments to Resend when present", async () => {
		process.env.RESEND_API_KEY = "re_x";
		const fetchSpy = vi.fn<
			(url: string, init: { body: string }) => Promise<{ ok: boolean }>
		>(() => Promise.resolve({ ok: true }));
		vi.stubGlobal("fetch", fetchSpy);
		await sendEmail({
			to: "a@example.com",
			subject: "s",
			html: "<p>h</p>",
			attachments: [{ filename: "x.pdf", content: "QkFTRTY0" }],
			devLog: "[t]",
		});
		const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as {
			attachments?: { filename: string; content: string }[];
		};
		expect(body.attachments?.[0].filename).toBe("x.pdf");
		expect(body.attachments?.[0].content).toBe("QkFTRTY0");
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
			await sendEmail({
				to: "a@example.com",
				subject: "Hi",
				html: "<p/>",
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
