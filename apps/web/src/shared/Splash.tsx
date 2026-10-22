import { Logo } from "@j-os/design-system";

import styles from "./Splash.module.scss";

/**
 * Full-viewport boot screen on the page background: the animated J floor mark,
 * shown while the session / role / onboarding queries resolve. Covers the
 * unavoidable auth-resolution delay with a single splash so the app never
 * flashes an intermediate (e.g. "no access") state on the way in.
 *
 * `ref` hands the boot gate the splash root, whose logo parts unfold into the
 * sidebar when the shell takes over.
 */
export function Splash(props: { ref?: (element: HTMLDivElement) => void }) {
	return (
		<div ref={props.ref} class={styles.splash}>
			<Logo animated variant="logo" class={styles.logo} />
		</div>
	);
}
