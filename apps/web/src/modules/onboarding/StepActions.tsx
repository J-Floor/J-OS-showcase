import { Show, useContext, type ParentProps } from "solid-js";

import styles from "./StepActions.module.scss";
import { StepProgressContext } from "./stepProgress.ts";

/**
 * Footer for an onboarding step's primary "advance" buttons (Continue, Sign,
 * Finish, …). On a wider screen it is the panel's footer, with the progress the
 * wizard provides on its left, and it sticks to the bottom of the window on a
 * long step. On a phone it sticks too and the buttons go full-width; the wizard
 * provides no progress there, because its header shows it. Secondary actions
 * (open WhatsApp, app-store links) stay inline in the step content.
 */
export function StepActions(props: ParentProps) {
	const progress = useContext(StepProgressContext);
	return (
		<div class={styles.actions}>
			<Show when={progress?.()}>
				{(label) => <p class={styles.progress}>{label()}</p>}
			</Show>
			{props.children}
		</div>
	);
}
