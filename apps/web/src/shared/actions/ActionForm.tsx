import type { JSX } from "solid-js";

import { runAction } from "./runAction.ts";
import type { ActionDescriptor } from "./shortcuts.ts";

/**
 * A form whose Enter runs `action` on `target`, through `runAction`: the
 * visible button sits elsewhere (a sheet's footer, an `ActionButton`) and
 * runs the action rather than submitting, so the form holds a hidden submit
 * of its own. The key, the button and Enter share one guard and spinner.
 */
export function ActionForm<Target>(props: {
	action: ActionDescriptor<Target>;
	target: Target;
	class?: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<form
			class={props.class}
			onSubmit={(event) => {
				event.preventDefault();
				void runAction(props.action, props.target);
			}}
		>
			<button type="submit" hidden tabIndex={-1} aria-hidden="true" />
			{props.children}
		</form>
	);
}
