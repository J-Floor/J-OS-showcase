import { Skeleton } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import type { Headline } from "./metrics.ts";
import styles from "./MetricTile.module.scss";

/**
 * One number, its label and a line about what it means.
 *
 * A tile rather than a chart on purpose: a single value plotted as one bar
 * carries less than the digits do and costs an axis and a legend to read. The
 * charts on this tab are for shapes over time; these are for the counts the
 * board acts on today.
 *
 * `tone` colours the VALUE only, never the whole tile — a wall of amber panels
 * reads as an outage, and most of these numbers are only worth a glance.
 */
export function MetricTile(props: {
	label: string;
	value: JSX.Element;
	/** Show a skeleton in place of the value while it is still loading. */
	loading?: boolean;
	detail?: string;
	tone?: Headline["tone"];
}): JSX.Element {
	return (
		<div class={styles.tile}>
			<span class={styles.label}>{props.label}</span>
			{/* `neutral` sets no status, so the value keeps its own colour. */}
			<span
				data-status={props.tone === "neutral" ? undefined : props.tone}
			>
				<span class={styles.value} data-metric-value="">
					<Show
						when={!props.loading}
						fallback={<Skeleton width="short" />}
					>
						{props.value}
					</Show>
				</span>
			</span>
			<span class={styles.detail}>{props.detail}</span>
		</div>
	);
}
