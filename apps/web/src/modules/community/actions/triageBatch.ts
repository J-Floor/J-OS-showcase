import type { Id } from "../../../../convex/_generated/dataModel";
import type { ActionOutcome } from "../../../shared/actions/shortcuts.ts";
import { useConfirm, type ConfirmOptions } from "../../../shared/confirm.tsx";

import { settleRosterAction } from "./RosterActionError.tsx";
import type { ShortcutScope } from "./shortcuts.ts";
import type { TriageResult } from "./triage.ts";

/** Runs one triage decision over checked rows; see `useTriageBatch`. */
export type TriageBatch = (
	rows: readonly { _id: Id<"people"> }[],
	act: (id: Id<"people">) => TriageResult,
	prompt?: ConfirmOptions
) => Promise<ActionOutcome>;

/**
 * A roster action's `runBatch`: asks `prompt` once for all the rows when
 * there is one, then runs `act` on each in turn (Convex mutations are
 * individually transactional). Stops at the first failure, which `scope`'s
 * roster shows, and settles refused; a declined prompt settles nothing.
 */
export function useTriageBatch(scope: ShortcutScope): TriageBatch {
	const confirm = useConfirm();
	return async (rows, act, prompt) => {
		if (prompt !== undefined && !(await confirm(prompt))) return;
		for (const row of rows) {
			const { refused } = await settleRosterAction(
				scope,
				row._id,
				act(row._id)
			);
			if (refused) return { refused };
		}
		return { refused: false };
	};
}
