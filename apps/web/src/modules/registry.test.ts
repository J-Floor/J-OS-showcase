// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { MODULE_PATHS } from "../../convex/lib/routes.ts";

import { modules } from "./registry.ts";

// The phone bar overflows from the end, so the page that matters least goes
// last.
test("tasks is the last module", () => {
	expect(modules.at(-1)?.id).toBe("tasks");
});

// The server validates `lastPath` against its own MODULE_PATHS copy (it can't
// import this registry). Keep the two in lockstep so a renamed/added module
// doesn't silently stop persisting as the last-visited route.
test("convex MODULE_PATHS matches the module registry paths", () => {
	expect(
		[...MODULE_PATHS].sort((first, second) => first.localeCompare(second))
	).toEqual(
		modules
			.map((entry) => entry.path)
			.sort((first, second) => first.localeCompare(second))
	);
});
