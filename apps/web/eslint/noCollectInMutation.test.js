// @vitest-environment node
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { noCollectInMutation } from "./noCollectInMutation.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

ruleTester.run("no-collect-in-mutation", noCollectInMutation, {
	valid: [
		`query({ args: {}, handler: async (ctx) => ctx.db.query("perks").collect() });`,
		`internalQuery({ handler: async (ctx) => ctx.db.query("perks").collect() });`,
		`mutation({ handler: async (ctx) => ctx.db.query("perks").withIndex("by_x", (r) => r.eq("x", 1)).take(10) });`,
		`async function helper(ctx) { return ctx.db.query("perks").collect(); }`,
		// A query inside a file of mutations is still a query, even nested in
		// an ordinary object's handler.
		`export const save = mutation({ handler: async () => null });
		export const list = query({ handler: async (ctx) => { const job = { handler: async () => ctx.db.query("perks").collect() }; return job.handler(); } });`,
		// The nearest builder decides: a query built inside a mutation is a query.
		`mutation({ handler: async () => { const list = query({ handler: async (ctx) => ctx.db.query("perks").collect() }); return list; } });`,
		`httpAction(async (ctx) => ctx.db.query("perks").collect());`,
		// An ordinary object's handler outside any builder is not a mutation.
		`const job = { handler: async (ctx) => ctx.db.query("perks").collect() };`,
	],
	invalid: [
		{
			// An ordinary object's handler inside a mutation does not end the
			// walk: the mutation's handler is what decides.
			code: `mutation({ handler: async (ctx) => { const job = { handler: async () => ctx.db.query("perks").collect() }; return job.handler(); } });`,
			errors: [{ messageId: "unbounded" }],
		},
		{
			code: `mutation({ args: {}, handler: async (ctx) => ctx.db.query("perks").collect() });`,
			errors: [{ messageId: "unbounded" }],
		},
		{
			code: `internalMutation({ handler: async (ctx) => { const rows = await ctx.db.query("perks").collect(); return rows; } });`,
			errors: [{ messageId: "unbounded" }],
		},
		{
			code: `internalMutation({ handler: async (ctx, { ids }) => Promise.all(ids.map(async () => ctx.db.query("perks").collect())) });`,
			errors: [{ messageId: "unbounded" }],
		},
	],
});
