import { Progress, type ProgressRootProps } from "@ark-ui/solid/progress";
import clsx from "clsx";
import type { JSX } from "solid-js";

import styles from "./ProgressBar.module.scss";

/** Ark's `value` and `max`, required and non-null: this bar is always
 *  determinate. */
type DeterminateValues = {
	[Key in "value" | "max"]-?: NonNullable<ProgressRootProps[Key]>;
};

export type ProgressBarProps = DeterminateValues &
	Pick<ProgressRootProps, "class"> & {
		/** Accessible name; not shown. */
		label: string;
	};

/** A determinate progress bar. A `max` of 0 (nothing to do) shows as full. */
export function ProgressBar(props: ProgressBarProps): JSX.Element {
	function isEmptyJob(): boolean {
		return props.max <= 0;
	}
	return (
		<Progress.Root
			class={clsx(styles.root, props.class)}
			min={0}
			max={isEmptyJob() ? 1 : props.max}
			value={isEmptyJob() ? 1 : Math.min(props.value, props.max)}
		>
			<Progress.Track class={styles.track} aria-label={props.label}>
				<Progress.Range class={styles.range} />
			</Progress.Track>
		</Progress.Root>
	);
}
