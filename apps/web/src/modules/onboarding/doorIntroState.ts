import {
	doorOpensFor,
	type LifecyclePerson,
} from "../../../convex/lib/derive.ts";

/** What the doors-intro decision reads off a person row. */
export type DoorsIntroPerson = LifecyclePerson & { doorsIntroSeenAt?: number };

/**
 * Whether the one-time "Getting in" intro is still owed to this person: their
 * door access is granted — the app will open the doors for them — and they
 * have not dismissed it yet. False while loading or signed out, and for anyone
 * the door is closed to: they cannot unlock, so there is nothing to introduce.
 * The welcome tour and What's New both wait while this is true.
 */
export function doorsIntroPending(
	person: DoorsIntroPerson | null | undefined,
	now: number
): boolean {
	if (!person) return false;
	if (person.doorsIntroSeenAt !== undefined) return false;
	return doorOpensFor(person, now);
}
