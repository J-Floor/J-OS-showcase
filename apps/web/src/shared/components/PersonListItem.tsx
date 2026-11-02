import { Avatar } from "@j-os/design-system";
import { Show, children, type JSX } from "solid-js";

import styles from "./PersonListItem.module.scss";

/**
 * One person in a sheet list: avatar, name, an optional muted detail line
 * (an email) and a trailing slot for what belongs to that row (a status
 * picker, a date). The trailing slot drops under the name on a narrow sheet.
 */
export function PersonListItem(props: {
	name: string;
	detail?: string;
	children?: JSX.Element;
}): JSX.Element {
	// Resolved once: reading `props.children` twice would build the trailing
	// content (a stateful status picker) twice per row.
	const trailing = children(() => props.children);
	return (
		<div class={styles.row}>
			<Avatar name={props.name} />
			<div class={styles.who}>
				<span class={styles.name}>{props.name}</span>
				<Show when={props.detail}>
					<span class={styles.detail}>{props.detail}</span>
				</Show>
			</div>
			<Show when={trailing()}>
				<div class={styles.trailing}>{trailing()}</div>
			</Show>
		</div>
	);
}
