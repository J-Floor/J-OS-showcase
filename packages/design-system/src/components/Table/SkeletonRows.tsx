import { For, Index, type JSX } from "solid-js";

import { Skeleton } from "../Skeleton/Skeleton.tsx";

import styles from "./Table.module.scss";

const WIDTHS = ["long", "medium", "short", "medium"] as const;
const DEFAULT_ROWS = 8;
const DEFAULT_COLUMNS = 4;

/** `<tr>` placeholders inside a real `<tbody>`: one cell per visible column, so
 *  the skeleton lines up with the header that is already on screen. The last
 *  cell takes the actions column's place when there is one. */
export function SkeletonRows(props: {
	columns: number;
	hasActions: boolean;
	rows?: number;
}): JSX.Element {
	return (
		<Index each={Array.from({ length: props.rows ?? DEFAULT_ROWS })}>
			{(_, rowIndex) => (
				<tr
					class={styles.skeletonRow}
					data-skeleton-row=""
					aria-hidden="true"
				>
					<Index each={Array.from({ length: props.columns })}>
						{(_, columnIndex) => (
							<td
								data-text-cell=""
								class={
									props.hasActions &&
									columnIndex === props.columns - 1
										? styles.actionsCell
										: undefined
								}
							>
								<Skeleton
									width={
										WIDTHS[
											(rowIndex + columnIndex) %
												WIDTHS.length
										]
									}
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
			<For each={Array.from({ length: props.rows ?? DEFAULT_ROWS })}>
				{(_, rowIndex) => (
					<div class={styles.skeletonTableRow} data-skeleton-row="">
						<Index
							each={Array.from({
								length: props.columns ?? DEFAULT_COLUMNS,
							})}
						>
							{(_, columnIndex) => (
								<Skeleton
									width={
										WIDTHS[
											(rowIndex() + columnIndex) %
												WIDTHS.length
										]
									}
								/>
							)}
						</Index>
					</div>
				)}
			</For>
		</div>
	);
}
