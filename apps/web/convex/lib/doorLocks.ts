// Brand-neutral lock identity: which physical doors this app manages, by the
// slot names the UI and the door actions address them with, and what each one
// can do. No provider code — a brand swap is a new door provider, not a change
// here.
import type { Infer } from "convex/values";

import type { lockSlot } from "../schema.ts";

import type { AssertEqual } from "./typeAssert.ts";

/** Which physical door an app action targets. */
export type LockSlot = "downstairs" | "upstairs";

/** Compile-time check that this type and the schema's `lockSlot` validator
 *  agree. */
const _lockSlotMatchesSchema: AssertEqual<
	Infer<typeof lockSlot>,
	LockSlot
> = true;
void _lockSlotMatchesSchema;

export const FRESH_MIN_AGE_MS = 5_000;

/** What the app can tell a door to do beyond opening it. `momentary`: the
 *  door releases for a moment, then relocks by itself. */
type LockCapabilities = {
	canLock: boolean;
	momentary: boolean;
};

/**
 * Per-door capabilities. Downstairs only releases the street door, which
 * locks by itself, so it has no lock action; upstairs locks and unlocks.
 */
export const LOCK_CAPABILITIES = {
	downstairs: { canLock: false, momentary: true },
	upstairs: { canLock: true, momentary: false },
} as const satisfies Record<LockSlot, LockCapabilities>;

/** Whether a door has a lock action, not just unlock. */
export function canLock(slot: LockSlot): boolean {
	return LOCK_CAPABILITIES[slot].canLock;
}
