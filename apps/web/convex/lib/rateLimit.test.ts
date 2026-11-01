import { describe, expect, it, vi } from "vitest";

import { magicLinkDecision } from "./rateLimit.ts";

type Call = { name: string; key?: string };

function fakeContext(answers: boolean[], person: object | null = null) {
	const calls: Call[] = [];
	const runMutation = vi.fn((_reference: unknown, args: Call) => {
		calls.push({ name: args.name, key: args.key });
		return Promise.resolve({ ok: answers.shift() ?? false, retryAfter: 0 });
	});
	const runQuery = vi.fn(() => Promise.resolve(person));
	return { ctx: { runMutation, runQuery } as never, calls, runQuery };
}

describe("magicLinkDecision", () => {
	it("checks the per-address bucket on the normalized email, then the global one for an unknown address", async () => {
		const unknown = fakeContext([true, true]);
		expect(await magicLinkDecision(unknown.ctx, " A@Example.com ")).toBe(
			"noAccount"
		);
		expect(unknown.calls).toEqual([
			{ name: "magicLinkAddress", key: "a@example.com" },
			{ name: "magicLink", key: undefined },
		]);
	});
	it("links a known person after the per-address bucket only", async () => {
		const known = fakeContext([true], { _id: "p1" });
		expect(await magicLinkDecision(known.ctx, "a@example.com")).toBe(
			"link"
		);
		expect(known.calls.map((call) => call.name)).toEqual([
			"magicLinkAddress",
		]);
	});
	it("is limited when the per-address bucket is exhausted", async () => {
		const first = fakeContext([false]);
		expect(await magicLinkDecision(first.ctx, "a@example.com")).toBe(
			"limited"
		);
		expect(first.calls.map((call) => call.name)).toEqual([
			"magicLinkAddress",
		]);
	});
	it("is limited for an unknown address when the global bucket is exhausted", async () => {
		const second = fakeContext([true, false]);
		expect(await magicLinkDecision(second.ctx, "a@example.com")).toBe(
			"limited"
		);
	});
});
