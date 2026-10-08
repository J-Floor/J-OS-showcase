import type { JSX } from "solid-js";

import styles from "./Spinner.module.scss";

export type SpinnerProps = {
	/** Overrides the spinner box size (defaults to a `--jf-spacing-*` step). */
	size?: string;
	class?: string;
};

export function Spinner(props: SpinnerProps): JSX.Element {
	return (
		<span
			role="status"
			aria-label="Loading"
			class={
				props.class
					? `${styles.spinner} ${props.class}`
					: styles.spinner
			}
			// inline style: forwards an arbitrary caller-supplied size into the --jf-spinner-size custom prop; no fixed set of values to express as classes
			style={props.size ? { "--jf-spinner-size": props.size } : undefined}
		/>
	);
}
