import { Show, type JSX } from "solid-js";

import { MORPH_OF } from "../../utils/morphPairing.ts";

import styles from "./Morph.module.scss";

export { MORPH_OF };

export type MorphProps = {
	/** The entity this element shows. A `Sheet` with the same id closes into it. */
	of: string;
	asChild?: (props: () => { [MORPH_OF]: string }) => JSX.Element;
	children?: JSX.Element;
};

/**
 * Marks an element as showing an entity, so a sheet for that entity can
 * close into it after the element it opened from is gone (the card moved
 * column, the sheet was opened from the palette). Only an attribute: no
 * registry, no effect, so a list of hundreds costs nothing.
 */
export function Morph(props: MorphProps): JSX.Element {
	function morphProps() {
		return { [MORPH_OF]: props.of };
	}
	return (
		<Show
			when={props.asChild}
			fallback={
				<div class={styles.morph} {...morphProps()}>
					{props.children}
				</div>
			}
		>
			{(asChild) => asChild()(morphProps)}
		</Show>
	);
}
