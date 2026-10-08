import type { ParentProps } from "solid-js";

import styles from "./StepActions.module.scss";

/**
 * Footer for an onboarding step's primary "advance" buttons (Continue, Sign,
 * Finish, …). Right-aligned at the end of the content on desktop; on mobile it
 * sticks to the bottom of the screen and the buttons go full-width. Secondary
 * actions (open WhatsApp, app-store links) stay inline in the step content.
 */
export function StepActions(props: ParentProps) {
	return <div class={styles.actions}>{props.children}</div>;
}
