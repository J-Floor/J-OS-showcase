import {
	Highlight as ArkHighlight,
	type HighlightProps as ArkHighlightProps,
} from "@ark-ui/solid/highlight";
import clsx from "clsx";
import { splitProps, type JSX } from "solid-js";

import styles from "./Highlight.module.scss";

/** Ark's Highlight props, minus the two defaults this wrapper fixes. */
export type HighlightProps = Omit<ArkHighlightProps, "ignoreCase" | "matchAll">;

/**
 * Marks the part of a string that matched a search.
 *
 * Ported from EmboUI's Highlight. Two defaults are overridden here because the
 * underlying `ignoreCase` is FALSE: a lowercase query would highlight nothing
 * in a capitalised name, and the component would appear to do nothing at all.
 * `matchAll` marks every occurrence rather than the first, which is what
 * someone scanning a list expects.
 */
export function Highlight(props: HighlightProps): JSX.Element {
	const [local, rest] = splitProps(props, ["class"]);
	return (
		<ArkHighlight
			{...rest}
			ignoreCase
			matchAll
			class={clsx(styles.highlight, local.class)}
		/>
	);
}
