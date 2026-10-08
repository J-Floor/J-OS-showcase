import { Button } from "@j-os/design-system";

import { PillArrow } from "../components/Arrows/Arrows.tsx";

import styles from "./NotFound.module.scss";

/** 404 page, shown for any unmatched route. Dark, centered, monospace —
 * matches the live site's "404 / page not found" screen. */
export function NotFound() {
	return (
		<main class={styles.page}>
			<div class={styles.backdrop} />
			<div class={styles.content}>
				<h1 class={styles.code}>404</h1>
				<p class={styles.message}>
					The page you&rsquo;re looking for doesn&rsquo;t
					exist&mdash;or maybe it moved somewhere else.
				</p>
				<Button as="a" href="/" variant="pill">
					Home page
					<PillArrow class={styles.pillArrow} />
				</Button>
			</div>
		</main>
	);
}
