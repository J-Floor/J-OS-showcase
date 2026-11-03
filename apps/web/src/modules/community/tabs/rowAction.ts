import { invariant } from "../../../../convex/lib/result.ts";
import {
	isBatchable,
	type BatchableAction,
} from "../../../shared/actions/batchOf.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";

/** The tab's row action `id`, which must run over several rows at once:
 *  for the selection bar's button that runs it over the checked rows. */
export function batchableAction<Row>(
	actions: readonly ActionDescriptor<Row>[],
	id: string
): BatchableAction<Row> {
	const action = actions.find((candidate) => candidate.id === id);
	invariant(
		action !== undefined && isBatchable(action),
		`No batchable '${id}' row action`
	);
	return action;
}
