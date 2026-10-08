import { Highlight as ArkHighlight } from "@ark-ui/solid/highlight";
import clsx from "clsx";
import type { JSX } from "solid-js";

import styles from "./Highlight.module.scss";

export type HighlightProps = {
	/** The full string to render. */
	text: string;
	/** What to mark inside it — typically whatever the user typed. */
	query: string | string[];
	class?: string;
};

/**
 * Marks the part of a string that matched a search.
 *
 * Ported from EmboUI's Highlight. Two defaults are overridden here because the
 * underlying `ignoreCase` is FALSE: a lowercase query would highlight nothing
 * in a capitalised name, which is every person's name, and the component would
 * appear to do nothing at all. `matchAll` marks every occurrence rather than
 * the first, which is what someone scanning a list expects.
 */
export function Highlight(props: HighlightProps): JSX.Element {
	return (
		<ArkHighlight
			text={props.text}
			query={props.query}
			ignoreCase
			matchAll
			class={clsx(styles.highlight, props.class)}
		/>
	);
}
