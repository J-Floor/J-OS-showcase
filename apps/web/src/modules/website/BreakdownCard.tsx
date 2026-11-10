import { ProgressBar } from "@j-os/design-system";
import { Index, Show, type JSX } from "solid-js";

import type { RankedRow } from "../../../convex/lib/webAnalytics.ts";

import styles from "./BreakdownCard.module.scss";
import { withShare } from "./websiteView.ts";

/** One dimension's top rows: label, count and a bar for its share of all
 *  views. A list, not a table: the rows are not entities and open nothing. */
export function BreakdownCard(props: {
	title: string;
	rows: RankedRow[];
	total: number;
}): JSX.Element {
	return (
		<section
			class={styles.card}
			aria-labelledby={`breakdown-${props.title}`}
		>
			<h3 id={`breakdown-${props.title}`} class={styles.title}>
				{props.title}
			</h3>
			<Show
				when={props.rows.length > 0}
				fallback={<p class={styles.empty}>No data yet.</p>}
			>
				<ol class={styles.list}>
					<Index each={withShare(props.rows, props.total)}>
						{(row) => (
							<li class={styles.row}>
								<span class={styles.label}>{row().label}</span>
								<span class={styles.count}>{row().count}</span>
								<ProgressBar
									class={styles.bar}
									label={`${row().label} share`}
									value={row().share}
									max={1}
								/>
							</li>
						)}
					</Index>
				</ol>
			</Show>
		</section>
	);
}
