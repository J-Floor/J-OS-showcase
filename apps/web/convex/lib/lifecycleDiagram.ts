// apps/web/convex/lib/lifecycleDiagram.ts
//
// Pure: no filesystem, no Convex. `scripts/lifecycleDiagram.ts` is the only
// thing that writes the result to disk.
import { ALL_STATES, TABLE } from "./lifecycle.ts";

function nodeId(state: string): string {
	return state.replace(".", "_");
}

/** Render TABLE as a Mermaid state diagram. The table is the source of truth. */
export function toMermaid(): string {
	const lines = ["stateDiagram-v2"];
	for (const state of ALL_STATES)
		lines.push(`    state "${state}" as ${nodeId(state)}`);
	for (const [from, node] of Object.entries(TABLE)) {
		for (const [event, rule] of Object.entries(node)) {
			const to =
				typeof rule.to === "string" ? nodeId(rule.to) : "dynamic";
			lines.push(`    ${nodeId(from)} --> ${to}: ${event}`);
		}
	}
	return lines.join("\n");
}
