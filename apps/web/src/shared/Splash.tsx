import { Logo } from "@j-os/design-system";

import styles from "./Splash.module.scss";

/**
 * Full-viewport boot screen on the page background: the animated J floor mark,
 * shown while the session / role / onboarding queries resolve. Covers the
 * unavoidable auth-resolution delay with a single splash so the app never
 * flashes an intermediate (e.g. "no access") state on the way in.
 */
export function Splash() {
	return (
		<div class={styles.splash}>
			<Logo animated variant="logo" class={styles.logo} />
		</div>
	);
}
