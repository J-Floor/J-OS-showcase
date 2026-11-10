import { describe, expect, it, vi } from "vitest";

import { analyticsProvider, dateWindow } from "./cloudflareWebAnalytics.ts";

const NOW = Date.UTC(2026, 10, 10, 12);

function group(count: number, metric?: string, date?: string) {
	return {
		count,
		sum: { visits: Math.floor(count / 2) },
		dimensions: {
			...(metric === undefined ? {} : { metric }),
			...(date === undefined ? {} : { date }),
		},
	};
}

function okBody(sampleInterval?: number) {
	return {
		data: {
			viewer: {
				accounts: [
					{
						totals: [
							{
								...group(120),
								...(sampleInterval === undefined
									? {}
									: { avg: { sampleInterval } }),
							},
						],
						daily: [
							group(50, undefined, "2026-11-08"),
							group(70, undefined, "2026-11-10"),
						],
						pages: [group(90, "/"), group(30, "/contact")],
						referrers: [group(12, "example.com"), group(5, "")],
						countries: [group(70, "CH")],
						devices: [group(80, "desktop")],
						browsers: [group(60, "Chrome")],
						os: [group(40, "macOS")],
					},
				],
			},
		},
		errors: null,
	};
}

function fakeFetch(status: number, body: unknown) {
	const requests: { url: string; init: RequestInit }[] = [];
	function impl(url: string, init: RequestInit) {
		requests.push({ url, init });
		return Promise.resolve(new Response(JSON.stringify(body), { status }));
	}
	return { fetch: impl as unknown as typeof fetch, requests };
}

function provider(fetchImpl: typeof fetch) {
	return analyticsProvider({
		fetch: fetchImpl,
		token: "token-test",
		accountId: "account-test",
		host: "site.example.com",
	});
}

describe("dateWindow", () => {
	it("covers `range` UTC days ending today", () => {
		const window = dateWindow(7, NOW);
		expect(window.start).toBe("2026-11-04");
		expect(window.end).toBe("2026-11-10");
		expect(window.days).toHaveLength(7);
		expect(window.days.at(0)).toBe("2026-11-04");
		expect(window.days.at(-1)).toBe("2026-11-10");
	});
});

describe("analyticsProvider.summary", () => {
	it("sends the account, host and dates with the bearer token", async () => {
		const { fetch, requests } = fakeFetch(200, okBody());
		await provider(fetch).summary(7, NOW);
		expect(requests).toHaveLength(1);
		const init = requests[0].init;
		expect(new Headers(init.headers).get("Authorization")).toBe(
			"Bearer token-test"
		);
		const body = JSON.parse(init.body as string) as {
			variables: Record<string, string>;
		};
		expect(body.variables).toEqual({
			accountTag: "account-test",
			host: "site.example.com",
			start: "2026-11-04",
			end: "2026-11-10",
		});
	});

	it("maps the response to a summary with zero-filled days", async () => {
		const { fetch } = fakeFetch(200, okBody());
		const result = await provider(fetch).summary(7, NOW);
		expect(result.isOk()).toBe(true);
		if (result.isErr()) return;
		const summary = result.value;
		expect(summary.totals).toEqual({ views: 120, visits: 60 });
		expect(summary.sampleInterval).toBe(1);
		expect(summary.daily).toHaveLength(7);
		expect(summary.daily.find((day) => day.date === "2026-11-08")).toEqual({
			date: "2026-11-08",
			views: 50,
			visits: 25,
		});
		expect(summary.daily.find((day) => day.date === "2026-11-09")).toEqual({
			date: "2026-11-09",
			views: 0,
			visits: 0,
		});
		expect(summary.pages).toEqual([
			{ label: "/", count: 90 },
			{ label: "/contact", count: 30 },
		]);
		expect(summary.referrers).toEqual([
			{ label: "example.com", count: 12 },
			{ label: "Direct", count: 5 },
		]);
	});

	it("maps the sample interval to the summary", async () => {
		const { fetch } = fakeFetch(200, okBody(10));
		const result = await provider(fetch).summary(90, NOW);
		expect(result._unsafeUnwrap().sampleInterval).toBe(10);
	});

	it("maps a budget error to rateLimited", async () => {
		const { fetch } = fakeFetch(200, {
			data: null,
			errors: [{ message: "limit", extensions: { code: "budget" } }],
		});
		const result = await provider(fetch).summary(30, NOW);
		expect(result.isErr() && result.error).toEqual({ kind: "rateLimited" });
	});

	it("maps HTTP 429 to rateLimited", async () => {
		const { fetch } = fakeFetch(429, {});
		const result = await provider(fetch).summary(30, NOW);
		expect(result.isErr() && result.error).toEqual({ kind: "rateLimited" });
	});

	it("maps HTTP 401 and 403 to unauthorized", async () => {
		for (const status of [401, 403]) {
			const { fetch } = fakeFetch(status, {});
			const result = await provider(fetch).summary(30, NOW);
			expect(result.isErr() && result.error).toEqual({
				kind: "unauthorized",
			});
		}
	});

	it("maps an authentication GraphQL error to unauthorized", async () => {
		const { fetch } = fakeFetch(200, {
			data: null,
			errors: [{ message: "not authorized for that account" }],
		});
		const result = await provider(fetch).summary(30, NOW);
		expect(result.isErr() && result.error).toEqual({
			kind: "unauthorized",
		});
	});

	it("gives the request a 15 s timeout and maps an abort to network", async () => {
		const controller = new AbortController();
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(controller.signal);
		const hanging = ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => {
					reject(new DOMException("timed out", "TimeoutError"));
				});
			})) as unknown as typeof fetch;
		const pending = provider(hanging).summary(30, NOW);
		controller.abort();
		const result = await pending;
		expect(timeout).toHaveBeenCalledWith(15_000);
		expect(result.isErr() && result.error).toEqual({ kind: "network" });
		timeout.mockRestore();
	});

	it("maps an abort while reading the body to network", async () => {
		const aborting = (() =>
			Promise.resolve({
				status: 200,
				json: () =>
					Promise.reject(
						new DOMException("timed out", "TimeoutError")
					),
			})) as unknown as typeof fetch;
		const result = await provider(aborting).summary(30, NOW);
		expect(result.isErr() && result.error).toEqual({ kind: "network" });
	});

	it("maps a rejected fetch and HTTP 5xx to network", async () => {
		const rejecting = (() =>
			Promise.reject(
				new TypeError("offline")
			)) as unknown as typeof fetch;
		const rejected = await provider(rejecting).summary(30, NOW);
		expect(rejected.isErr() && rejected.error).toEqual({ kind: "network" });
		const { fetch } = fakeFetch(502, {});
		const failed = await provider(fetch).summary(30, NOW);
		expect(failed.isErr() && failed.error).toEqual({ kind: "network" });
	});

	it("maps an unexpected shape to malformed", async () => {
		const { fetch } = fakeFetch(200, {
			data: { viewer: { accounts: [] } },
		});
		const result = await provider(fetch).summary(30, NOW);
		expect(result.isErr() && result.error).toEqual({ kind: "malformed" });
	});
});
