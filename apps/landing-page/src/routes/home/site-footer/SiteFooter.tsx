import styles from "./SiteFooter.module.scss";

const DESIGNER_LINKEDIN = "https://www.linkedin.com/in/kaitlynn-a-hawranke/";
const NEMU_URL = "https://nemuandco.com";
const NEMU_LOGO = "/assets/logos/nemu-and-co.webp";
const WORDMARK = "/assets/logos/j-floor-wordmark.svg";

/** The last block of the live thejfloor.com footer: the full-width "J floor"
 * wordmark (the site's own SVG), then the "Designed by" credit and the nemu &
 * co. studio button. */
export function SiteFooter() {
	return (
		<footer class={styles.footer}>
			<img class={styles.wordmark} src={WORDMARK} alt="J floor" />
			<div class={styles.credits}>
				<p class={styles.designedBy}>
					<span>Designed by</span>
					<a
						class={styles.designerLink}
						href={DESIGNER_LINKEDIN}
						rel="noopener"
						target="_blank"
					>
						Kaitlynn A. Hawranke
					</a>
				</p>
				<a
					class={styles.nemu}
					href={NEMU_URL}
					rel="noopener"
					target="_blank"
					aria-label="nemu & co."
				>
					<img
						class={styles.nemuLogo}
						src={NEMU_LOGO}
						alt=""
						width={109}
						height={42}
						loading="lazy"
					/>
				</a>
			</div>
		</footer>
	);
}
