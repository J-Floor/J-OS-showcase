import { ProgressBar } from "@j-os/design-system";
import { A } from "@solidjs/router";
import { Index, Show, type JSX } from "solid-js";

import type { RankedRow } from "../../../convex/lib/webAnalytics.ts";

import { withShare } from "./analyticsView.ts";
import styles from "./BreakdownCard.module.scss";

/** A ranked row; `href` makes its label a link to what it counts. */
export type BreakdownRow = RankedRow & { href?: string };

/** One dimension's top rows: label, count and a bar for its share of all
 *  views. A list, not a table. Rows may link to what they count. */
export function BreakdownCard(props: {
	title: string;
	rows: BreakdownRow[];
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
								<Show
									when={row().href}
									fallback={
										<span class={styles.label}>
											{row().label}
										</span>
									}
								>
									{(href) => (
										<A class={styles.label} href={href()}>
											{row().label}
										</A>
									)}
								</Show>
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
