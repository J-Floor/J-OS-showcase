import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { PerkRequestStatus } from "../lib/perks.ts";
import type { Readers } from "../lib/readOnce.ts";

import type { HistoryEntry, HistoryScope, PerkEntry } from "./types.ts";

/** A perk entry with its perk's title and partner joined in, or left out
 *  once the perk is gone. */
async function perkEntry(
	readers: Readers,
	entry: Omit<PerkEntry, "kind" | "perkTitle" | "partner">
): Promise<PerkEntry> {
	const perk =
		entry.perkId === undefined ? null : await readers.perk(entry.perkId);
	return {
		kind: "perk",
		...entry,
		perkTitle: perk?.title,
		partner: perk?.partner,
	};
}

/** The perk id `perkRequests.ts` writes in a `perk` row's `meta`, or
 *  undefined when the row lacks it: a malformed row degrades to an unlinked
 *  entry rather than breaking the whole history. */
function perkIdOf(meta: unknown): Id<"perks"> | undefined {
	if (typeof meta !== "object" || meta === null || !("perkId" in meta))
		return undefined;
	return typeof meta.perkId === "string"
		? (meta.perkId as Id<"perks">)
		: undefined;
}

async function toEntry(
	readers: Readers,
	row: Doc<"personEvents">
): Promise<HistoryEntry> {
	if (row.kind !== "perk") return { ...row, kind: row.kind };
	return perkEntry(readers, {
		_id: row._id,
		at: row.at,
		// `perkRequests.ts` is the only writer, and stores the new status.
		event: row.event as PerkRequestStatus,
		perkRequestId: row.perkRequestId,
		perkId: perkIdOf(row.meta),
		actorId: row.actorId,
	});
}

/** The scope's newest `personEvents` rows, at most `limit`: a person's own,
 *  or one perk request's. */
export async function personEventsSource(
	context: QueryCtx,
	readers: Readers,
	scope: HistoryScope,
	limit: number
): Promise<HistoryEntry[]> {
	const rows =
		"personId" in scope
			? await context.db
					.query("personEvents")
					.withIndex("by_personId_and_at", (range) =>
						range.eq("personId", scope.personId)
					)
					.order("desc")
					.take(limit)
			: await context.db
					.query("personEvents")
					.withIndex("by_perkRequestId_and_at", (range) =>
						range.eq("perkRequestId", scope.perkRequestId)
					)
					.order("desc")
					.take(limit);
	return Promise.all(rows.map((row) => toEntry(readers, row)));
}
