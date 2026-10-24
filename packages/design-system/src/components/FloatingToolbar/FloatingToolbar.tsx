import clsx from "clsx";
import { type ComponentProps, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";

import { createMediaQuery, PHONE_QUERY } from "../../utils/media.ts";
import {
	useFloatingStackSlot,
	useInFloatingStack,
} from "../FloatingStack/FloatingStack.tsx";

import styles from "./FloatingToolbar.module.scss";

export type FloatingToolbarProps = ComponentProps<"div">;

/**
 * A page's primary controls. On a wide screen a plain row the caller places
 * (at the end of a tab bar, the top of a page). On a phone, below a
 * `FloatingStack`, the same controls join the stack as its last pill, so
 * they float at the foot of the stack's box under whatever else floats
 * there. Without a stack they stay a plain row. Among the stack's own
 * children it is a pill where it is placed, on every screen. Render it only
 * while it has controls; an empty one is still a pill.
 */
export function FloatingToolbar(props: FloatingToolbarProps): JSX.Element {
	const isStacked = useInFloatingStack();
	const slot = useFloatingStackSlot();
	const isPhone = createMediaQuery(PHONE_QUERY);
	function toolbar(isFloating: boolean): JSX.Element {
		return (
			<div
				data-part="floating-toolbar"
				{...props}
				data-floating={isFloating ? "" : undefined}
				class={clsx(styles.toolbar, props.class)}
			/>
		);
	}
	return (
		<Show
			when={!isStacked && isPhone() ? slot?.() : undefined}
			fallback={toolbar(isStacked)}
		>
			{(mount) => <Portal mount={mount()}>{toolbar(true)}</Portal>}
		</Show>
	);
}
