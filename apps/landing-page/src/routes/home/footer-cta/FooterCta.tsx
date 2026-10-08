import { Button } from "@j-os/design-system";
import { A } from "@solidjs/router";

import { LinkArrow, PillArrow } from "../../../components/Arrows/Arrows.tsx";
import { SITE_APPLY_URL, SITE_EMAIL, SITE_LINKEDIN } from "../../../site.ts";

import styles from "./FooterCta.module.scss";

/** Closing call-to-action, matched to the live thejfloor.com: a centred
 * "Apply to join" pill, then a five-column grid with the monospace closing
 * line in the first two columns and the two link groups in columns four and
 * five. The oversized wordmark and studio credit live in SiteFooter below. */
export function FooterCta() {
	return (
		<section class={styles.section}>
			<div class={styles.ctaRow}>
				<Button as="a" href={SITE_APPLY_URL} variant="pill">
					Apply to join
					<PillArrow class={styles.pillArrow} />
				</Button>
			</div>

			<div class={styles.grid}>
				<h2 class={styles.heading}>
					A startup base in the heart of Zurich
				</h2>

				<nav aria-label="Site" class={styles.siteLinks}>
					<A class={styles.link} href="/">
						Home
					</A>
					<A class={styles.link} href="/contact">
						Contact
					</A>
				</nav>

				<nav aria-label="Elsewhere" class={styles.elsewhereLinks}>
					<a
						class={styles.link}
						href={SITE_LINKEDIN}
						rel="noopener"
						target="_blank"
					>
						LinkedIn
						<LinkArrow class={styles.linkArrow} />
					</a>
					<a class={styles.link} href={`mailto:${SITE_EMAIL}`}>
						Email
						<LinkArrow class={styles.linkArrow} />
					</a>
				</nav>
			</div>
		</section>
	);
}
