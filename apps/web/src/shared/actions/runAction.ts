import { useOverlayCovered } from "@j-os/design-system";
import { createSignal } from "solid-js";

import { useConfirmAsking } from "../confirm.tsx";

import type { ActionDescriptor, ActionOutcome } from "./shortcuts.ts";

/** One run's place in the guard: the action and what it runs on. */
type RunKey = { action: object; target: unknown };

/** The runs that have not settled yet. */
const [running, setRunning] = createSignal<readonly RunKey[]>([]);

/** Whether `item` carries a document id. */
function hasId(item: unknown): item is { _id: unknown } {
	return typeof item === "object" && item !== null && "_id" in item;
}

/** Every batch's identity: see `identity`. */
const BATCH = "batch";

/** A target's identity across refetches: its `_id` when it has one (a row
 *  comes back as a new object); for a batch (an array of rows), one for all
 *  of them, so a batch run is keyed by its action alone: its rows leave the
 *  selection as they land, and a key read from them would drop the guard
 *  and the spinner mid-run; else itself (a sentinel such as `PAGE_TARGET`). */
function identity(target: unknown): unknown {
	if (Array.isArray(target)) return BATCH;
	return hasId(target) ? target._id : target;
}

/** Whether `action` has a run on `target` in flight: its confirm is open,
 *  or its write has not come back. Reactive. */
export function isRunning<Target>(
	action: ActionDescriptor<Target>,
	target: Target
): boolean {
	const id = identity(target);
	return running().some((key) => key.action === action && key.target === id);
}

/**
 * Whether a button shows a run in flight (`isRunning`) as its spinner: not
 * while the run's own confirm waits for an answer (`useConfirmAsking`, from
 * the ask on: the dialog shows a frame or more later, through its morph, and
 * a spinner in that gap flickers on and off), nor while an overlay covers
 * the button (a dialog of its own). A spinner there hides the label behind
 * the dialog and leaves a blank button; once the confirm is answered, the
 * write shows it. Called in the button's component, for its place in the
 * overlays and under the confirm provider.
 */
export function useRunSpinner(): {
	isShown: <Target>(
		action: ActionDescriptor<Target>,
		target: Target
	) => boolean;
} {
	const isCovered = useOverlayCovered();
	const isAsking = useConfirmAsking();
	return {
		isShown: (action, target) =>
			isRunning(action, target) && !isAsking() && !isCovered(),
	};
}

/**
 * Runs `action` on `target`, unless `target` cannot take it, or a run of it
 * on the same target is already in flight: a second press of Delete while the first one's confirm
 * is open, or its write is on its way, would queue a second confirm. Every
 * entry point goes through here (a key, an `ActionBar`, an `ActionButton`, a
 * row's `RowActionButton`, a form's Enter), so they share the guard and the
 * button shows the run. Another row's run of the same action is not held
 * up.
 */
export async function runAction<Target>(
	action: ActionDescriptor<Target>,
	target: Target
): Promise<ActionOutcome> {
	if (!action.can(target) || isRunning(action, target)) return undefined;
	const pending = action.run(target);
	if (pending === undefined) return undefined;
	const key: RunKey = { action, target: identity(target) };
	setRunning((current) => [...current, key]);
	try {
		return await pending;
	} finally {
		setRunning((current) => current.filter((other) => other !== key));
	}
}
