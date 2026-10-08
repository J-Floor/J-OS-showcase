import { For, Index, type JSX } from "solid-js";

import { Skeleton } from "../Skeleton/Skeleton.tsx";

import styles from "./Table.module.scss";

const WIDTHS = ["long", "medium", "short", "medium"] as const;

/** `<tr>` placeholders inside a real `<tbody>`: one cell per visible column, so
 *  the skeleton lines up with the header that is already on screen. */
export function SkeletonRows(props: {
	columns: number;
	rows?: number;
}): JSX.Element {
	return (
		<Index each={Array.from({ length: props.rows ?? 8 })}>
			{(_, r) => (
				<tr
					class={styles.skeletonRow}
					data-skeleton-row=""
					aria-hidden="true"
				>
					<Index each={Array.from({ length: props.columns })}>
						{(_, c) => (
							<td>
								<Skeleton
									width={WIDTHS[(r + c) % WIDTHS.length]}
								/>
							</td>
						)}
					</Index>
				</tr>
			)}
		</Index>
	);
}

/** Standalone table-shaped skeleton for places with no `Table` yet: a page
 *  whose chunk is loading, or a panel waiting to learn which tab to mount. */
export function TableSkeleton(props: {
	rows?: number;
	columns?: number;
}): JSX.Element {
	return (
		<div class={styles.skeletonTable} role="status" aria-label="Loading">
			<For each={Array.from({ length: props.rows ?? 8 })}>
				{(_, r) => (
					<div class={styles.skeletonTableRow} data-skeleton-row="">
						<Index
							each={Array.from({ length: props.columns ?? 4 })}
						>
							{(_, c) => (
								<Skeleton
									width={WIDTHS[(r() + c) % WIDTHS.length]}
								/>
							)}
						</Index>
					</div>
				)}
			</For>
		</div>
	);
}
