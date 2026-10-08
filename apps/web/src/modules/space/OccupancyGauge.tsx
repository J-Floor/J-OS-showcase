import { Icon } from "@j-os/design-system";
import { For } from "solid-js";

import { ICONS } from "../../shared/icons.ts";

import styles from "./OccupancyCard.module.scss";

const SLOTS = [0, 1, 2];

/**
 * A proportional occupancy gauge: three person icons with a colored layer
 * clipped from the left to `fill` (0–1) over a muted base layer.
 */
export function OccupancyGauge(props: { fill: number }) {
	return (
		<div class={styles.gauge} role="img" aria-label="Space occupancy">
			<div class={styles.row} aria-hidden="true">
				<For each={SLOTS}>{() => <Icon fill>{ICONS.person}</Icon>}</For>
			</div>
			<div
				class={styles.fill}
				data-fill-layer
				aria-hidden="true"
				style={{ width: `${props.fill * 100}%` }}
			>
				<div class={styles.row}>
					<For each={SLOTS}>
						{() => <Icon fill>{ICONS.person}</Icon>}
					</For>
				</div>
			</div>
		</div>
	);
}
