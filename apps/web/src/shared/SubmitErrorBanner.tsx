import { Icon } from "@j-os/design-system";
import { Show } from "solid-js";

import { ICONS } from "./icons.ts";
import styles from "./SubmitErrorBanner.module.scss";

/** The alert a form shows when its submission failed; renders nothing while
 *  there is no message. */
export function SubmitErrorBanner(props: { message: string | null }) {
	return (
		<Show when={props.message}>
			<div class={styles.banner} role="alert">
				<Icon>{ICONS.error}</Icon>
				<span>{props.message}</span>
			</div>
		</Show>
	);
}
