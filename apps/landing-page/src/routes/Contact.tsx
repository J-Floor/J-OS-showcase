import { For } from "solid-js";

import { SITE_APPLY_URL, SITE_EMAIL } from "../site.ts";

import styles from "./Contact.module.scss";
import { FooterCta } from "./home/footer-cta/FooterCta.tsx";
import { PoweredBy } from "./home/powered-by/PoweredBy.tsx";
import { SiteFooter } from "./home/site-footer/SiteFooter.tsx";

type ContactRow = { label: string; value: string; href: string };

const ROWS: ContactRow[] = [
	{ label: "Get in touch", value: SITE_EMAIL, href: `mailto:${SITE_EMAIL}` },
	{
		label: "Apply to Community",
		value: "The J floor is an exclusive space for those who ship. Apply to be considered.",
		href: SITE_APPLY_URL,
	},
];

/** Contact page, matched to the live thejfloor.com/contact: a full-viewport
 * block whose content sits at the bottom — the "We're listening." heading over
 * two full-width link rows (label left, value right, hairline below) — then the
 * same closing CTA, partner ticker, and footer as the home page. The live
 * "Contact Form" is hidden, so there is no form. */
export function Contact() {
	return (
		<>
			<main class={styles.page}>
				<div class={styles.stack}>
					<h1 class={styles.heading}>We&apos;re listening.</h1>
					<For each={ROWS}>
						{(row) => (
							<a
								class={styles.row}
								href={row.href}
								rel="noopener"
								target="_blank"
							>
								<span>{row.label}</span>
								<span class={styles.value}>{row.value}</span>
							</a>
						)}
					</For>
				</div>
			</main>
			<FooterCta />
			<PoweredBy />
			<SiteFooter />
		</>
	);
}
