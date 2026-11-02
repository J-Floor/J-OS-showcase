import { Sheet } from "@j-os/design-system";
import type { JSX } from "solid-js";

import { InlineError } from "../InlineError.tsx";

import styles from "./SheetFooter.module.scss";

/**
 * A sheet's footer, top to bottom: the `lead` (a field or a note that goes
 * with the actions), why the last action failed, then the actions, right
 * aligned. An `ActionBar` among the actions spans the full width.
 */
export function SheetFooter(props: {
	lead?: JSX.Element;
	error?: string | null;
	children: JSX.Element;
}): JSX.Element {
	return (
		<Sheet.Footer>
			<div class={styles.footer}>
				{props.lead}
				<InlineError message={props.error} />
				<div class={styles.footerActions}>{props.children}</div>
			</div>
		</Sheet.Footer>
	);
}
