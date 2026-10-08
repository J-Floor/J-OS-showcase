// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { orderedViews, ONBOARDING_VIEWS } from "./registry.ts";

describe("onboarding registry", () => {
	it("has a view for every required step id", () => {
		for (const id of ["welcome", "document", "rules", "visit"] as const) {
			expect(ONBOARDING_VIEWS[id]).toBeDefined();
			expect(ONBOARDING_VIEWS[id].component).toBeTypeOf("function");
		}
	});

	it("orderedViews follows the shared step order", () => {
		expect(orderedViews().map((v) => v.id)).toEqual([
			"welcome",
			"document",
			"rules",
			"visit",
		]);
	});
});
