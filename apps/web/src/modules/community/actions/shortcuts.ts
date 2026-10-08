import type { Hotkey } from "@tanstack/solid-hotkeys";

/**
 * Where a key is live. Two actions may share a letter across scopes but never
 * within one — `M` means "make them a member" on both Applications and Guests,
 * and that is the point.
 */
export type ShortcutScope = "applications" | "members" | "guests" | "drawer";

/**
 * One action, in one object.
 *
 * The row's icon button, the drawer's decision bar and the key binding all read
 * this. Splitting them let the same action mean different things depending on
 * where it was invoked from, which is the bug the decisions hook already warns
 * about in its own comment.
 */
export type ActionDescriptor<Person> = {
	id: string;
	/** Button label and tooltip text. Never includes the key. */
	label: string;
	/** Material Symbols ligature. */
	icon: string;
	hotkey: Hotkey;
	scope: ShortcutScope;
	/** Whether the action is on offer for this person. Drives both the button's
	 *  disabled state and the binding's `enabled`. */
	can: (person: Person) => boolean;
	/**
	 * Why the action is unavailable, shown on the disabled button.
	 *
	 * Separate from `can` because the answer is often more specific than the
	 * question: "View agreement" is off both while one is loading and when there
	 * is none, and those read differently to whoever is looking. Without it a
	 * disabled button falls back to repeating its own label, which tells the
	 * board nothing about why it cannot press it.
	 */
	disabledReason?: (person: Person) => string;
	run: (person: Person) => void | Promise<void>;
};

/**
 * Fails loudly when two actions in the same scope claim the same letter.
 *
 * With bare letters across three tabs this is a live risk, and a collision is
 * invisible at runtime — one binding simply wins and the other key does nothing
 * anyone can explain.
 */
export function assertNoCollisions<Person>(
	actions: readonly ActionDescriptor<Person>[]
): void {
	const seen = new Map<string, string>();
	for (const action of actions) {
		const key = `${action.scope}:${action.hotkey}`;
		const owner = seen.get(key);
		if (owner !== undefined)
			throw new Error(
				`Shortcut collision in scope "${action.scope}": "${action.hotkey}" is claimed by both "${owner}" and "${action.id}".`
			);
		seen.set(key, action.id);
	}
}

/**
 * The subset of a selection an action actually applies to.
 *
 * The batch bar and the keys must narrow a mixed selection the same way, and
 * they used not to: `MembersTab` filtered kicked-out rows out of a kick-out
 * batch in a local closure, so the rule lived in the tab rather than with the
 * action, and nothing else could reach it. Now `can()` is the only rule and
 * every entry point asks it.
 */
export function eligible<Person>(
	action: ActionDescriptor<Person>,
	people: readonly Person[]
): Person[] {
	return people.filter((person) => action.can(person));
}
