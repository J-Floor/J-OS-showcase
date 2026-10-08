import { Badge } from "@j-os/design-system";
import { For, type JSX } from "solid-js";

import type { PersonStatus } from "../../../../convex/lib/derive.ts";

import { flagLabel, flagTone } from "./copy.ts";
import styles from "./FlagsCell.module.scss";

/**
 * The Flags column. Renders one badge per exception and NOTHING for a person
 * whose state holds no surprises.
 *
 * The column this replaced led with "Member · active" on every row — which the
 * tab and the group header above it had already said twice. A column that
 * repeats its neighbours is a column the reader learns to skip, and the one row
 * in fifty that actually needed attention was hidden inside that habit. Here an
 * empty cell means "nothing to know", so anything at all is worth reading.
 */
export function FlagsCell(props: { status: PersonStatus }): JSX.Element {
	return (
		<div class={styles.flags}>
			<For each={props.status.flags}>
				{(flag) => (
					<Badge status={flagTone(flag)}>{flagLabel(flag)}</Badge>
				)}
			</For>
		</div>
	);
}
