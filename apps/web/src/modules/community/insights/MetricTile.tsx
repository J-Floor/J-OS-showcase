import { type JSX } from "solid-js";

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
	detail?: string;
	tone?: "neutral" | "warning" | "error";
}): JSX.Element {
	return (
		<div class={styles.tile} data-tone={props.tone ?? "neutral"}>
			<span class={styles.label}>{props.label}</span>
			<span class={styles.value}>{props.value}</span>
			<span class={styles.detail}>{props.detail}</span>
		</div>
	);
}
