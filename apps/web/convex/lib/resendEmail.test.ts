import { afterEach, describe, expect, it, vi } from "vitest";

import { resendProvider } from "./resendEmail.ts";

function stubFetch(response: {
	ok: boolean;
	status: number;
	headers?: Record<string, string>;
	body?: unknown;
}) {
	const fetchSpy = vi.fn(() =>
		Promise.resolve({
			ok: response.ok,
			status: response.status,
			headers: new Headers(response.headers ?? {}),
			json: () => Promise.resolve(response.body ?? {}),
		})
	);
	vi.stubGlobal("fetch", fetchSpy);
	return fetchSpy;
}

type SentBody = {
	to: string;
	text?: string;
	html?: string;
	attachments?: { filename: string; content: string }[];
};

function bodyOf(fetchSpy: ReturnType<typeof stubFetch>): SentBody {
	const [, init] = fetchSpy.mock.calls[0] as unknown as [
		string,
		{ body: string },
	];
	return JSON.parse(init.body) as SentBody;
}

const MESSAGE = { to: "ada@example.com", subject: "s", html: "<p>h</p>" };

describe("resendProvider", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("declares the free-plan limits, billed per recipient", () => {
		const provider = resendProvider("re_x");
		expect(provider.limits).toEqual({ daily: 100, monthly: 3000 });
		expect(provider.billing).toBe("perRecipient");
	});

	it("posts one recipient, never cc or bcc", async () => {
		const fetchSpy = stubFetch({ ok: true, status: 200 });
		await resendProvider("re_x").send(MESSAGE);
		const body = bodyOf(fetchSpy);
		expect(body.to).toBe("ada@example.com");
		expect(body).not.toHaveProperty("cc");
		expect(body).not.toHaveProperty("bcc");
	});

	it("forwards the text part", async () => {
		const fetchSpy = stubFetch({ ok: true, status: 200 });
		await resendProvider("re_x").send({ ...MESSAGE, text: "h" });
		const body = bodyOf(fetchSpy);
		expect(body.text).toBe("h");
		expect(body.html).toBe("<p>h</p>");
	});

	it("forwards attachments", async () => {
		const fetchSpy = stubFetch({ ok: true, status: 200 });
		await resendProvider("re_x").send({
			...MESSAGE,
			attachments: [{ filename: "x.pdf", content: "QkFTRTY0" }],
		});
		const body = bodyOf(fetchSpy);
		expect(body.attachments?.[0].filename).toBe("x.pdf");
		expect(body.attachments?.[0].content).toBe("QkFTRTY0");
	});

	it("reads the used-quota headers", async () => {
		stubFetch({
			ok: true,
			status: 200,
			headers: {
				"x-resend-daily-quota": "42",
				"x-resend-monthly-quota": "900",
			},
		});
		expect(await resendProvider("re_x").send(MESSAGE)).toEqual({
			kind: "sent",
			usage: { dailyUsed: 42, monthlyUsed: 900 },
		});
	});

	it.each(["-1", "abc", "1.5", ""])(
		"ignores the junk header %j",
		async (junk) => {
			stubFetch({
				ok: true,
				status: 200,
				headers: { "x-resend-daily-quota": junk },
			});
			expect(await resendProvider("re_x").send(MESSAGE)).toEqual({
				kind: "sent",
				usage: {},
			});
		}
	);

	it.each([
		["daily_quota_exceeded", "daily"],
		["monthly_quota_exceeded", "monthly"],
	] as const)("maps a 429 %s to quotaExceeded", async (name, window) => {
		stubFetch({ ok: false, status: 429, body: { name } });
		expect(await resendProvider("re_x").send(MESSAGE)).toEqual({
			kind: "quotaExceeded",
			window,
		});
	});

	it("maps a rate-limit 429 and other errors to rejected", async () => {
		stubFetch({
			ok: false,
			status: 429,
			body: { name: "rate_limit_exceeded" },
		});
		expect(await resendProvider("re_x").send(MESSAGE)).toEqual({
			kind: "rejected",
			status: 429,
		});
	});
});
