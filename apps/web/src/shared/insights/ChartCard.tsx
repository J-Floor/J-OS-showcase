import { Skeleton } from "@j-os/design-system";
import { Show, type ParentProps } from "solid-js";

import styles from "./ChartCard.module.scss";

/** A chart card: its title and hint, then the chart, or a chart-sized
 *  skeleton until its data is in. `loading` is a flag, not `Query`'s
 *  `undefined`: a card's data can wait on several queries at once, which no
 *  single `Query.Root data` can hold. */
export function ChartCard(
	props: ParentProps<{ title: string; hint: string; loading: boolean }>
) {
	return (
		<figure class={styles.card}>
			<figcaption class={styles.cardTitle}>
				{props.title}
				<span class={styles.cardHint}>{props.hint}</span>
			</figcaption>
			<Show
				when={!props.loading}
				fallback={<Skeleton class={styles.chartSkeleton} />}
			>
				{props.children}
			</Show>
		</figure>
	);
}
