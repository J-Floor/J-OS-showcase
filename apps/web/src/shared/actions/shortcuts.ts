import type { Hotkey } from "@tanstack/solid-hotkeys";

import { invariant } from "../../../convex/lib/result.ts";

/** A settled action. A refusal has already been shown, so callers only
 *  learn whether there was one (to stop a batch or keep a ring). */
export type SettledAction = { refused: boolean };

/** How an async action ended; `undefined` when it was cancelled. */
export type ActionOutcome = SettledAction | undefined;

/** What a page's (or a card's) own actions act on: the page itself. */
export const PAGE_TARGET = "page";
export type PageTarget = typeof PAGE_TARGET;

/** What a sheet's Create acts on: its create form. */
export const CREATE_TARGET = "form";
export type CreateTarget = typeof CREATE_TARGET;

/**
 * One action, in one object.
 *
 * The row's icon button, the sheet's action bar and the key binding all read
 * this. Splitting them let the same action mean different things depending on
 * where it was invoked from.
 *
 * Where its key is live is the binding's (`createActionKeys`' `scope`), not
 * the action's.
 */
export type ActionDescriptor<Target> = {
	id: string;
	/** Button label and tooltip text. Never includes the key. */
	label: string;
	/** Material Symbols ligature. */
	icon: string;
	hotkey: Hotkey;
	/** Wrap the action's button in confetti, for the one decision worth
	 *  celebrating. */
	celebrate?: boolean;
	/** Whether the action is on offer for this target. Drives both the
	 *  button's disabled state and the binding's `enabled`. */
	can: (target: Target) => boolean;
	/**
	 * Why the action is unavailable, shown on the disabled button.
	 *
	 * Separate from `can` because the answer is often more specific than the
	 * question: "View agreement" is off both while one is loading and when there
	 * is none, and those read differently to whoever is looking. Without it a
	 * disabled button falls back to repeating its own label, which tells the
	 * viewer nothing about why they cannot press it. `null` when the label
	 * already says why ("Requested on 3 Nov"): the button then has no
	 * tooltip, which on a phone would stay up after a tap.
	 */
	disabledReason?: (target: Target) => string | null;
	/** Whether work the action does not run itself is under way (a check
	 *  the page started on its own): its button shows the spinner. */
	isBusy?: (target: Target) => boolean;
	run: (target: Target) => Promise<ActionOutcome> | undefined;
	/**
	 * Runs the action over several targets at once: one confirm for all of
	 * them, then each in turn, settling refused at the first failure. A key
	 * pressed with rows checked runs it, as the selection bar's button does
	 * (`batchOf`); an action without it runs `run` on each checked row.
	 */
	runBatch?: (targets: Target[]) => Promise<ActionOutcome> | undefined;
};

/** Which action holds each key, and how many bindings hold it, per scope. */
const claims = new Map<string, Map<string, { id: string; count: number }>>();

/**
 * Claims `actions`' keys in `scope`, for as long as the returned release is
 * not called. Fails loudly when another action in the scope holds one of
 * them already, in this binding or another sharing the scope: with bare
 * letters across several tabs this is a live risk, and a collision is
 * invisible at runtime (one binding simply wins and the other key does
 * nothing anyone can explain). The same action bound twice (a sheet mounted
 * twice) is no collision.
 */
export function claimKeys<Target>(
	scope: string,
	actions: readonly ActionDescriptor<Target>[]
): () => void {
	const held =
		claims.get(scope) ?? new Map<string, { id: string; count: number }>();
	const wanted = new Map<string, string>();
	for (const action of actions) {
		const owner = wanted.get(action.hotkey) ?? held.get(action.hotkey)?.id;
		invariant(
			owner === undefined || owner === action.id,
			`Shortcut collision in scope "${scope}": "${action.hotkey}" is claimed by both "${String(owner)}" and "${action.id}".`
		);
		wanted.set(action.hotkey, action.id);
	}
	claims.set(scope, held);
	for (const [hotkey, id] of wanted) {
		const claim = held.get(hotkey) ?? { id, count: 0 };
		claim.count += 1;
		held.set(hotkey, claim);
	}
	return () => {
		for (const hotkey of wanted.keys()) {
			const claim = held.get(hotkey);
			if (claim === undefined) continue;
			claim.count -= 1;
			if (claim.count === 0) held.delete(hotkey);
		}
	};
}

/**
 * The subset of a selection an action actually applies to.
 *
 * The batch bar and the keys must narrow a mixed selection the same way, so
 * `can()` is the only rule and every entry point asks it.
 */
export function eligible<Target>(
	action: ActionDescriptor<Target>,
	targets: readonly Target[]
): Target[] {
	return targets.filter((target) => action.can(target));
}

/** Keys pressed with one of these modifiers type nothing. Shift and Alt are
 *  left out: Shift types capitals, and Alt types accents on a Mac. */
const NON_TYPING_MODIFIERS = ["Mod", "Control", "Meta"];

/**
 * Whether a key types nothing into a field, so it may fire while someone is
 * typing: a combo with Mod, Control or Meta (Create's `Mod+Enter`), or
 * `Escape`. A bare letter, `Delete` or `Enter` belongs to the field.
 */
export function typesNothing(hotkey: Hotkey): boolean {
	const parts = hotkey.split("+");
	return (
		hotkey === "Escape" ||
		parts
			.slice(0, -1)
			.some((modifier) => NON_TYPING_MODIFIERS.includes(modifier))
	);
}

/** A disabled button's reason for `action` on `target`, as the button takes
 *  it: the action's own, or its label when it has none, or no tooltip at all
 *  when the action says its label is the reason (`null`). `override` (a
 *  row's own wording) wins over the action's. */
export function disabledReasonProps<Target>(
	action: ActionDescriptor<Target>,
	target: Target,
	override?: string
): { disabledReason: string } | { shamefullyOmitDisabledReason: true } {
	const reason = override ?? action.disabledReason?.(target);
	return reason === null
		? { shamefullyOmitDisabledReason: true }
		: { disabledReason: reason ?? action.label };
}
