// apps/web/scripts/lifecycleDiagram.ts
//
// `bun run lifecycle:diagram` rewrites the committed docs/lifecycle.md.
import { writeFileSync } from "node:fs";

import { toMermaid } from "../convex/lib/lifecycleDiagram.ts";

writeFileSync(
	new URL("../../../docs/lifecycle.md", import.meta.url),
	[
		"# Lifecycle machine",
		"",
		"Generated from `apps/web/convex/lib/lifecycle.ts`. Do not edit by hand —",
		"run `bun run lifecycle:diagram` in `apps/web`. A test fails if this file is",
		"stale, so the picture cannot drift from the machine.",
		"",
		"This is the picture only. [`lifecycle-machine.md`](./lifecycle-machine.md)",
		"explains how the machine works and what to know before changing it — read",
		"that first if you are about to add a state, an event or an effect.",
		"",
		"An edge labelled `dynamic` targets a state chosen at runtime from the",
		"event and the facts (RE_ADMIT returns to `formerOf` — the tier a person",
		"held before they left, so a re-admitted person returns to it; SET_ROLE,",
		"IMPORT, GRANT_CORE, REVOKE_CORE and EXTEND_WINDOW leaving guest.expired",
		"all take their target tier from the event or resolve to `.active` or",
		"`.onboarding` depending on whether the person's compliance and steps are",
		"complete).",
		"",
		"```mermaid",
		toMermaid(),
		"```",
		"",
	].join("\n")
);
