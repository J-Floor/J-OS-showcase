// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { MODULE_PATHS } from "../../convex/lib/routes.ts";

import { modules } from "./registry.ts";

// The server validates `lastPath` against its own MODULE_PATHS copy (it can't
// import this registry). Keep the two in lockstep so a renamed/added module
// doesn't silently stop persisting as the last-visited route.
test("convex MODULE_PATHS matches the module registry paths", () => {
	expect([...MODULE_PATHS].sort()).toEqual(modules.map((m) => m.path).sort());
});
