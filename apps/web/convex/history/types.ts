import type { Doc, Id } from "../_generated/dataModel";
import type { PerkRequestStatus } from "../lib/perks.ts";

/** A `personEvents` row as the history returns it: every stored field, plus
 *  its actor's name once `historyFor` has joined it. */
export type PersonEventEntry = Doc<"personEvents"> & { actorName?: string };

/** A perk request made or moved to a status, from a `perk` event. */
export type PerkEntry = {
	kind: "perk";
	_id: string;
	at: number;
	event: PerkRequestStatus;
	perkRequestId?: Id<"perkRequests">;
	/** Absent only on a malformed event row: the entry shows, unlinked. */
	perkId?: Id<"perks">;
	/** Absent once the perk is gone. */
	perkTitle?: string;
	partner?: string;
	actorId?: Id<"people">;
	actorName?: string;
};

/** A door the person unlocked or locked from the app, from the door log. */
export type DoorActionEntry = {
	kind: "door_action";
	_id: string;
	at: number;
	action: Extract<Doc<"doorLog">["operation"], "unlock" | "lock">;
	slot: Doc<"doorLog">["slot"];
	outcome: Doc<"doorLog">["outcome"];
	detail?: string;
	actorId?: Id<"people">;
	actorName?: string;
};

/** One entry of a history, whichever source it comes from. */
export type HistoryEntry =
	| ({
			kind: Exclude<Doc<"personEvents">["kind"], "perk">;
	  } & PersonEventEntry)
	| PerkEntry
	| DoorActionEntry;

/** Every kind a history can hold: what a renderer must cover. */
export type HistoryKind = HistoryEntry["kind"];

/** Whose history: one person's, or one perk request's. */
export type HistoryScope =
	{ personId: Id<"people"> } | { perkRequestId: Id<"perkRequests"> };
