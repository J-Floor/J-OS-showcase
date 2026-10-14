import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema.ts";

import { insertSignature } from "./signatures.ts";

const modules = import.meta.glob("../**/*.*s");

describe("insertSignature", () => {
	it("rejects a signature with neither a file nor a link, writing nothing", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "nofile@example.com",
				firstName: "No",
				lastName: "File",
				tier: "guest",
				stage: "onboarding",
				stageSince: 1,
			})
		);
		await expect(
			backend.run((context) =>
				insertSignature(context, {
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
			await backend.run((context) =>
				context.db.query("signatures").collect()
			)
		).toHaveLength(0);
		const stored = await backend.run((context) => context.db.get(personId));
		expect(stored?.signedVariants).toBeUndefined();
	});
});
