import { v } from "convex/values";

import { query } from "./_generated/server";
import { historyFor } from "./history/historyFor.ts";
import type { HistoryEntry } from "./history/types.ts";
import { requireRole } from "./lib/authGuard.ts";
import { unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";

/**
 * A person's history, newest first, with actor names resolved: their own
 * events, their app door actions and their perk requests (`historyFor`).
 * Board-only: it records suspensions, kicks and internal reasons, and is
 * never shown to the person themselves.
 */
export const listForPerson = query({
	args: { personId: v.id("people") },
	handler: async (context, { personId }): Promise<HistoryEntry[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		return historyFor(context, { personId });
	},
});
