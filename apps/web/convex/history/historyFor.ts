import type { QueryCtx } from "../_generated/server";
import { nameOf } from "../lib/names.ts";
import { readOnce, type Readers } from "../lib/readOnce.ts";

import { doorLogSource } from "./doorLogSource.ts";
import { personEventsSource } from "./personEventsSource.ts";
import type { HistoryEntry, HistoryScope } from "./types.ts";

/** The most `personEvents` rows the history holds. Door actions have their
 *  own budget (DOOR_ACTION_LIMIT), so a busy door user's unlocks never push
 *  their events out: each source keeps its own cap, and the merge drops
 *  nothing. */
export const HISTORY_LIMIT = 200;

function sourcesFor(
	context: QueryCtx,
	readers: Readers,
	scope: HistoryScope
): Promise<HistoryEntry[]>[] {
	const events = personEventsSource(context, readers, scope, HISTORY_LIMIT);
	return "personId" in scope
		? [events, doorLogSource(context, scope.personId)]
		: [events];
}

/**
 * A person's or a perk request's history: every source merged, newest first,
 * each source within its own cap, with each actor's name joined in (read once per
 * actor). Backfilled rows carry no actor and get no name rather than an
 * invented one.
 */
export async function historyFor(
	context: QueryCtx,
	scope: HistoryScope
): Promise<HistoryEntry[]> {
	const readers = readOnce(context);
	const sourced = await Promise.all(sourcesFor(context, readers, scope));
	const entries = sourced
		.flat()
		// eslint-disable-next-line id-length -- conventional comparator parameter names
		.toSorted((a, b) => b.at - a.at);
	return Promise.all(
		entries.map(async (entry) => ({
			...entry,
			actorName: await nameOf(readers, entry.actorId),
		}))
	);
}
