import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema.ts";

import { insertSignature } from "./signatures.ts";

const modules = import.meta.glob("../**/*.*s");

describe("insertSignature", () => {
	it("rejects a signature with neither a file nor a link, writing nothing", async () => {
		const t = convexTest(schema, modules);
		const personId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "nofile@example.com",
				firstName: "No",
				lastName: "File",
				tier: "guest",
				stage: "onboarding",
				stageSince: 1,
			})
		);
		await expect(
			t.run((ctx) =>
				insertSignature(ctx, {
					personId,
					email: "nofile@example.com",
					variant: "guest",
					signedName: "No File",
					agreementVersion: "1",
					agreementHash: "h",
					signedAt: 1,
				})
			)
		).rejects.toThrow("A signature needs a fileId or a sourceUrl.");
		expect(
			await t.run((ctx) => ctx.db.query("signatures").collect())
		).toHaveLength(0);
		expect(
			(await t.run((ctx) => ctx.db.get(personId)))?.signedVariants
		).toBeUndefined();
	});
});
