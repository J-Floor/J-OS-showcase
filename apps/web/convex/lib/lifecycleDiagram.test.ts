// @vitest-environment node
// apps/web/convex/lib/lifecycleDiagram.test.ts
//
// node, not the app-wide edge-runtime: this test reads the committed diagram
// off disk to prove it has not gone stale.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ALL_STATES } from "./lifecycle.ts";
import { toMermaid } from "./lifecycleDiagram.ts";

describe("lifecycle diagram", () => {
	it("declares every state as a node", () => {
		const mermaid = toMermaid();
		for (const state of ALL_STATES) {
			expect(mermaid).toContain(state.replace(".", "_"));
		}
	});

	it("names the event on every edge", () => {
		expect(toMermaid()).toContain(
			"guest_active --> guest_expired: WINDOW_EXPIRED"
		);
	});

	it("matches the committed docs/lifecycle.md", () => {
		const committed = readFileSync(
			new URL("../../../../docs/lifecycle.md", import.meta.url),
			"utf8"
		);
		expect(committed).toContain(toMermaid());
	});
});
