import type { JSX } from "solid-js";

import { fireConfetti } from "../../utils/confetti.ts";

import styles from "./Confetti.module.scss";

export type ConfettiProps = {
	children: JSX.Element;
};

/**
 * Wrap any control; a click inside bursts confetti from this spot, then the
 * click passes straight through to the child (it's just a bubbling listener, no
 * interception). Disabled controls emit no click event, so they never fire it.
 *
 * ```tsx
 * <Confetti><Button onClick={accept}>Accept</Button></Confetti>
 * ```
 */
export function Confetti(props: ConfettiProps): JSX.Element {
	let ref: HTMLSpanElement | undefined;
	return (
		<span
			ref={(el) => (ref = el)}
			class={styles.origin}
			onClick={() => {
				fireConfetti(ref);
			}}
		>
			{props.children}
		</span>
	);
}
