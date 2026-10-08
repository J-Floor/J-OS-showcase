import type { JSX, ParentProps } from "solid-js";

import styles from "./PromptStack.module.scss";

/**
 * Floats one-time prompt pills (install, notifications) at the foot of the
 * content column, stacked top to bottom in child order. The stack takes no
 * pointer events itself, so while it is empty (or in the gap between pills)
 * clicks reach the page underneath; each pill opts back in.
 */
export function PromptStack(props: ParentProps): JSX.Element {
	return <div class={styles.stack}>{props.children}</div>;
}
