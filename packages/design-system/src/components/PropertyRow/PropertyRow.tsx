import type { JSX } from "solid-js";

import { Icon } from "../Icon/Icon.tsx";

import styles from "./PropertyRow.module.scss";

/** Notion-style property row: leading icon + label on the left, control right. */
export function PropertyRow(props: {
	icon: string;
	label: string;
	children: JSX.Element;
	/** Forwarded to the row element (e.g. to anchor an effect to this row). */
	ref?: (el: HTMLDivElement) => void;
}): JSX.Element {
	return (
		<div ref={props.ref} class={styles.row}>
			<div class={styles.key}>
				<Icon>{props.icon}</Icon>
				<span>{props.label}</span>
			</div>
			<div class={styles.value}>{props.children}</div>
		</div>
	);
}
