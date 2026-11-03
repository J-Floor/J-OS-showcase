import type { ActionDescriptor } from "./shortcuts.ts";

/** A row action that can run over several rows at once (`runBatch`). */
export type BatchableAction<Target> = ActionDescriptor<Target> &
	Required<Pick<ActionDescriptor<Target>, "runBatch">>;

/** Whether `action` runs over several rows at once. */
export function isBatchable<Target>(
	action: ActionDescriptor<Target>
): action is BatchableAction<Target> {
	return action.runBatch !== undefined;
}

/** Each row action's batch, made once: see `batchOf`. */
const batches = new WeakMap<object, ActionDescriptor<never[]>>();

/**
 * `action` over the checked rows, as one action: its label, icon and key
 * (read from it on use, so a label that changes stays current), run through
 * its `runBatch`. Made once per row action, so the key pressed with rows
 * checked (`createActionKeys`) and the selection bar's button hold the same
 * object: the run guard (`runAction`) sees one run, and the button shows its
 * spinner whichever started it.
 */
export function batchOf<Target>(
	action: BatchableAction<Target>
): ActionDescriptor<Target[]> {
	const made = batches.get(action) as ActionDescriptor<Target[]> | undefined;
	if (made !== undefined) return made;
	const batch: ActionDescriptor<Target[]> = {
		id: `${action.id}-batch`,
		get label() {
			return action.label;
		},
		get icon() {
			return action.icon;
		},
		get hotkey() {
			return action.hotkey;
		},
		can: (targets) => targets.length > 0,
		run: (targets) => action.runBatch(targets),
	};
	batches.set(action, batch);
	return batch;
}
