import { convexTest } from "convex-test";
import { expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

it("refuses a caller with no app role", async () => {
	const t = convexTest(schema, modules);
	await expect(t.action(api.occupancy.current, {})).rejects.toThrow(
		/Forbidden/
	);
});

it("answers a member", async () => {
	const t = convexTest(schema, modules);
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "mem@example.com",
			firstName: "Mem",
			lastName: "",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	const occ = await t
		.withIdentity({ email: "mem@example.com" })
		.action(api.occupancy.current, {});
	// No provider is active: occupancy is disabled, not unknown.
	expect(occ).toEqual({ enabled: false });
});

it("refuses staff: occupancy is for the community", async () => {
	const t = convexTest(schema, modules);
	await t.run((ctx) =>
		ctx.db.insert("people", {
			email: "staff@example.com",
			firstName: "Sta",
			lastName: "",
			tier: "staff",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	await expect(
		t
			.withIdentity({ email: "staff@example.com" })
			.action(api.occupancy.current, {})
	).rejects.toThrow(/Forbidden/);
});
