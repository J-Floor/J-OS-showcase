import { Logo } from "@j-os/design-system";

import styles from "./Splash.module.scss";

/**
 * The boot splash's logo: the animated J floor mark, shown (by the boot
 * gate's `BrandReveal`) while the session / role / onboarding queries
 * resolve. Covers the unavoidable auth-resolution delay with a single splash
 * so the app never flashes an intermediate (e.g. "no access") state on the
 * way in.
 */
export function Splash() {
	return <Logo animated variant="logo" class={styles.logo} />;
}
