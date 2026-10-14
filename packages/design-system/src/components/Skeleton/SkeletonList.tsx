import clsx from "clsx";
import { For, type JSX } from "solid-js";

import { Skeleton } from "./Skeleton.tsx";
import styles from "./SkeletonList.module.scss";

export type SkeletonListProps = {
	/** @default 3 */
	rows?: number;
	class?: string;
};

const WIDTHS = ["long", "medium", "short"] as const;
const DEFAULT_ROWS = 3;

/** A stack of manual skeleton bars for a list whose rows are not known yet. */
export function SkeletonList(props: SkeletonListProps): JSX.Element {
	return (
		<div
			class={clsx(styles.list, props.class)}
			role="status"
			aria-label="Loading"
			data-skeleton-list=""
		>
			<For
				each={Array.from(
					{ length: props.rows ?? DEFAULT_ROWS },
					(_, index) => index
				)}
			>
				{(index) => <Skeleton width={WIDTHS[index % WIDTHS.length]} />}
			</For>
		</div>
	);
}
