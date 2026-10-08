import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

/** One door-log row as the log queries return it. */
export type LogRow = FunctionReturnType<typeof api.doorLog.listSince>[number];

/** The "To door" cell: how long the door took to react to an app action
 *  (both times are the server's, so there is no clock skew), `No response`
 *  when it never did, `Waiting…` while the server still watches it, and
 *  empty for a row with no attempt (grants, revokes, refusals, and rows
 *  written before the door's reaction was watched). */
export function toDoorText(
	row: Pick<LogRow, "actuation" | "requestedAt" | "actuatedAt">
): string {
	switch (row.actuation) {
		case "actuated":
			return row.actuatedAt === undefined || row.requestedAt === undefined
				? ""
				: `${((row.actuatedAt - row.requestedAt) / 1000).toFixed(1)}s`;
		case "unconfirmed":
			return "No response";
		case "accepted":
			return "Waiting…";
		case undefined:
			return "";
	}
}
