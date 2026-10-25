/**
 * Helpers for the app's compound components (`{ Root, …parts }`, the design
 * system's form): a part's context, and a slot a part fills for its root.
 */
import {
	createRenderEffect,
	createSignal,
	onCleanup,
	untrack,
	useContext,
	type Accessor,
	type Context,
} from "solid-js";

import { invariant } from "../../convex/lib/result.ts";

/** A compound part's context, or a throw naming `part` and the `root` it
 *  must sit inside. */
export function useRequiredContext<T>(
	context: Context<T | undefined>,
	part: string,
	root: string
): T {
	const value = useContext(context);
	invariant(value, `${part} must sit inside ${root}.`);
	return value;
}

/** Something a root shows that one of its parts supplies from wherever it
 *  sits (a header's help icon, a footer's lead). */
export type PartSlot<T> = {
	value: Accessor<T | undefined>;
	/** Called by the part: shows `value` while the part is mounted. An
	 *  unmount clears the slot only if it still holds this part's value, so
	 *  it never clears a value another part has since put there. */
	fill: (value: Accessor<T>) => void;
};

export function createPartSlot<T>(): PartSlot<T> {
	const [value, setValue] = createSignal<T>();
	function fill(next: Accessor<T>): void {
		createRenderEffect(() => {
			const current = next();
			// Wrapped: a value that is itself a function would be called as
			// an updater.
			setValue(() => current);
			onCleanup(() => {
				if (untrack(value) === current) setValue(undefined);
			});
		});
	}
	return { value, fill };
}
