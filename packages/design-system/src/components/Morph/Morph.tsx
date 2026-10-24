import { mergeProps, Show, type JSX } from "solid-js";

import { MORPH_OF } from "../../utils/morphPairing.ts";
import type { TriggerProps } from "../../utils/triggerProps.ts";

import styles from "./Morph.module.scss";

export { MORPH_OF };

export type MorphProps = {
	/** The entity this element shows. A `Sheet` with the same id closes into it. */
	of: string;
	/** Render the consumer's own element instead of a `<div>`, the way an Ark
	 *  part's `asChild` does: spread `props(ownProps)` onto it. */
	asChild?: (
		props: (userProps?: JSX.IntrinsicElements["div"]) => TriggerProps<"div">
	) => JSX.Element;
	children?: JSX.Element;
};

/**
 * Marks an element as showing an entity, so a sheet for that entity can
 * close into it after the element it opened from is gone (it moved, or the
 * sheet was opened from somewhere else). Only an attribute: no registry, no
 * effect, so a list of hundreds costs nothing.
 */
export function Morph(props: MorphProps): JSX.Element {
	function morphAttributes() {
		return { [MORPH_OF]: props.of };
	}
	function childProps(
		userProps?: JSX.IntrinsicElements["div"]
	): TriggerProps<"div"> {
		// eslint-disable-next-line solid/reactivity -- the merged object goes straight to the caller's spread, which tracks it
		return mergeProps(userProps ?? {}, morphAttributes());
	}
	return (
		<Show
			when={props.asChild}
			fallback={
				<div class={styles.morph} {...morphAttributes()}>
					{props.children}
				</div>
			}
		>
			{(asChild) => asChild()(childProps)}
		</Show>
	);
}
