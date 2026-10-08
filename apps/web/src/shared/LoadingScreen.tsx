import { Spinner } from "@j-os/design-system";

import styles from "./LoadingScreen.module.scss";

/**
 * Centered spinner for transient in-app loading (route landing, onboarding,
 * sign-in). Fixed to the viewport so it centers regardless of its parent's
 * height. For the initial auth boot use {@link Splash} instead.
 */
export function LoadingScreen() {
	return (
		<div class={styles.wrap}>
			<Spinner />
		</div>
	);
}
