import { A } from "@solidjs/router";

import styles from "./SiteHeader.module.scss";

/** Slim, persistent site header shared across pages: monospace "J floor"
 * wordmark linking home, and a frosted "Apply to join" pill linking to the
 * apply/contact page. Transparent so it sits over the hero, pinned to the
 * top of the viewport on scroll. */
export function SiteHeader() {
	return (
		<header class={styles.header}>
			<A class={styles.wordmark} href="/">
				J floor
			</A>
			<A class={styles.applyPill} href="/contact">
				Apply to join
				<span aria-hidden="true" class={styles.arrow}>
					↗
				</span>
			</A>
		</header>
	);
}
