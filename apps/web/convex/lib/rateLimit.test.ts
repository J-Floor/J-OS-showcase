import { describe, expect, it, vi } from "vitest";

import { mayMagicLink } from "./rateLimit.ts";

type Call = { name: string; key?: string };

function fakeCtx(answers: boolean[], person: object | null = null) {
	const calls: Call[] = [];
	const runMutation = vi.fn((_ref: unknown, args: Call) => {
		calls.push({ name: args.name, key: args.key });
		return Promise.resolve({ ok: answers.shift() ?? false, retryAfter: 0 });
	});
	const runQuery = vi.fn(() => Promise.resolve(person));
	return { ctx: { runMutation, runQuery } as never, calls, runQuery };
}

describe("mayMagicLink", () => {
	it("checks the per-address bucket on the normalized email, then the global one for an unknown address", async () => {
		const unknown = fakeCtx([true, true]);
		expect(await mayMagicLink(unknown.ctx, " A@Example.com ")).toBe(true);
		expect(unknown.calls).toEqual([
			{ name: "magicLinkAddress", key: "a@example.com" },
			{ name: "magicLink", key: undefined },
		]);
	});
	it("skips the global bucket for a known person", async () => {
		const known = fakeCtx([true], { _id: "p1" });
		expect(await mayMagicLink(known.ctx, "a@example.com")).toBe(true);
		expect(known.calls.map((c) => c.name)).toEqual(["magicLinkAddress"]);
	});
	it("stops at the per-address bucket", async () => {
		const first = fakeCtx([false]);
		expect(await mayMagicLink(first.ctx, "a@example.com")).toBe(false);
		expect(first.calls.map((c) => c.name)).toEqual(["magicLinkAddress"]);
	});
	it("stops at the global bucket for an unknown address", async () => {
		const second = fakeCtx([true, false]);
		expect(await mayMagicLink(second.ctx, "a@example.com")).toBe(false);
	});
});
