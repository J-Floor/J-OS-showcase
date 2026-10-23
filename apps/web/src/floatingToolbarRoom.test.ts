// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

/** The floating toolbar floats over the page: the scrolling area reserves
 *  room at its end, never the page box a bounded console sizes against. */
function source(path: string): string {
	return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

test("the page content does not shrink for the floating toolbar", () => {
	expect(source("app.module.scss")).not.toContain(
		"--jf-floating-toolbar-offset"
	);
});

test("a bounded panel leaves the room to the table scrolling inside it", () => {
	expect(source("shared/listShell.scss")).toMatch(
		/@mixin panel \{[^}]*padding-block-end: 0;/
	);
});

test("the insights tab, its own scroller, leaves room at its end", () => {
	expect(
		source("modules/community/insights/InsightsTab.module.scss")
	).toMatch(/\.tab \{[^}]*var\(--jf-floating-toolbar-offset\)/);
});
