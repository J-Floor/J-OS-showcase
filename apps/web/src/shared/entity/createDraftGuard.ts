import {
	type Accessor,
	createEffect,
	createSignal,
	on,
	onCleanup,
	untrack,
} from "solid-js";

import { useLeaveGuard } from "../../routing/leaveGuards.ts";

type Values = Record<string, unknown>;

/** Arrays (a list of assignee ids) compare by their items. */
function isSameValue(left: unknown, right: unknown): boolean {
	return Array.isArray(left) && Array.isArray(right)
		? left.length === right.length &&
				left.every((item, index) => Object.is(item, right[index]))
		: Object.is(left, right);
}

/** Asks the browser's own "Leave site?" before the tab closes or reloads. */
function warnBeforeUnload(event: BeforeUnloadEvent): void {
	event.preventDefault();
}

function differs(baseline: Values, values: Values): boolean {
	return Object.keys(values).some(
		(key) => !isSameValue(baseline[key], values[key])
	);
}

/**
 * A create form's draft guard. Dirty while open and some field differs
 * from the value it opened with: a value filled in for the person (a
 * scanned tag, a dragged date) is where the form starts, not a change.
 *
 * While dirty, every way out asks first: the sheet's own (pass
 * `confirmClose`, `discardRef` and `onOpenChange` to its `Sheet.Root`), the
 * router's (a page, a tab, Back: the sheet's discard prompt again, and
 * Discard goes on with the leave), and the browser tab's (its own
 * "Leave site?"). A close the sheet makes itself, through `onOpenChange`
 * (Discard, a create that went through), stands the guard down.
 *
 * Create it after the form's own reset, so its baseline is the reset form.
 */
export function createDraftGuard(options: {
	/** Open on the create form. */
	isOpen: Accessor<boolean>;
	/** The form's current values. */
	values: Accessor<Values>;
	/** The sheet's own close: the caller's `onOpenChange`. */
	onOpenChange: (isOpen: boolean) => void;
}) {
	const [baseline, setBaseline] = createSignal<Values>({});
	const [isReleased, setReleased] = createSignal(false);
	createEffect(
		on(options.isOpen, (isOpen) => {
			if (!isOpen) return;
			setBaseline(untrack(options.values));
			setReleased(false);
		})
	);

	function dirty(): boolean {
		return (
			options.isOpen() &&
			!isReleased() &&
			differs(baseline(), options.values())
		);
	}

	let ask: ((onDiscard: () => void) => void) | undefined;
	useLeaveGuard((proceed) => {
		if (!dirty() || !ask) return false;
		ask(() => {
			setReleased(true);
			proceed();
		});
		return true;
	});

	createEffect(() => {
		if (!dirty()) return;
		window.addEventListener("beforeunload", warnBeforeUnload);
		onCleanup(() => {
			window.removeEventListener("beforeunload", warnBeforeUnload);
		});
	});

	return {
		dirty,
		confirmClose: dirty,
		discardRef: (asker: (onDiscard: () => void) => void): void => {
			ask = asker;
		},
		onOpenChange: (isOpen: boolean): void => {
			if (!isOpen) setReleased(true);
			options.onOpenChange(isOpen);
		},
	};
}
