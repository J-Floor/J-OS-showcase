import type { Doc } from "../../../convex/_generated/dataModel";
import type { LockSlot } from "../../../convex/lib/doorLocks.ts";
import { slotInfo } from "../doors/lockSlots.ts";

/**
 * Every word about a door in a history: the person's timeline and the board's
 * door log both read from here, so neither can name an operation, an outcome
 * or a door differently. Each surface keeps its own form: the log wants the
 * short column words, the timeline wants sentences.
 */

/** The door log's operation column, one word per schema member.
 *  `satisfies Record<union, string>` makes a missing or stale key a compile
 *  error here, not a filter option that quietly never shows. */
export const OPERATION_LABEL = {
	grant: "Grant",
	revoke: "Revoke",
	unlock: "Unlock",
	lock: "Lock",
} as const satisfies Record<Doc<"doorLog">["operation"], string>;

/** The door log's outcome column, one word per schema member. */
export const OUTCOME_LABEL = {
	ok: "Ok",
	partial: "Partial",
	failed: "Failed",
	"dry-run": "Dry run",
	busy: "Busy",
} as const satisfies Record<Doc<"doorLog">["outcome"], string>;

/** A door audit row records the override it moved to. */
// dry-ignore -- same if-then-ternary shape as booleanSegment in the design system Table filter, but it words a door override and that one maps a filter value
export function doorEventLabel(override: unknown): string {
	if (override === "force_off") return "Door access blocked by the board";
	return override === "force_on"
		? "Door access forced open by the board"
		: "Door override cleared — back to normal rules";
}

/** "the Downstairs door", worded from the Space page's own door labels so the
 *  timeline and the unlock buttons never name a door differently. */
function doorName(slot: LockSlot | undefined): string {
	return slot === undefined ? "a door" : `the ${slotInfo(slot).label} door`;
}

/** A door the person unlocked or locked from the app. A failed one says so:
 *  "Unlocked" on a door that never opened would be a false alibi. */
export function doorActionLabel(
	action: "unlock" | "lock",
	slot: LockSlot | undefined,
	outcome: keyof typeof OUTCOME_LABEL
): string {
	if (outcome === "busy")
		return `Tried to ${action} ${doorName(slot)} — the lock was still busy`;
	if (outcome !== "ok")
		return `Tried to ${action} ${doorName(slot)} — failed`;
	return `${action === "lock" ? "Locked" : "Unlocked"} ${doorName(slot)}`;
}
