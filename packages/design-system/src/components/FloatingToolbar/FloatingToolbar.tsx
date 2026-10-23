import clsx from "clsx";
import { type ComponentProps } from "solid-js";

import styles from "./FloatingToolbar.module.scss";

export type FloatingToolbarProps = ComponentProps<"div">;

/**
 * A page's primary controls. On a wide screen a plain row the caller places
 * (at the end of a tab bar, the top of a page). On a phone the same node
 * floats as a pill at the foot of the nearest positioned ancestor (the app's
 * content column, above its bottom bar), so nothing between that ancestor and
 * the toolbar may be positioned. While it shows, `--jf-floating-toolbar-offset`
 * on the root holds the height it takes: the other bottom floaters clear it
 * and scrolling areas leave that much room at their end. Render it only while
 * it has controls; an empty one is still a pill.
 */
export function FloatingToolbar(props: FloatingToolbarProps) {
	return (
		<div
			data-part="floating-toolbar"
			{...props}
			class={clsx(styles.toolbar, props.class)}
		/>
	);
}
