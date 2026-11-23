import { site } from "./site.ts";
import styles from "./Website.module.scss";

export function Footer() {
	return (
		<footer class={styles.footer}>
			<div class={styles.footerIdentity}>
				<a class={styles.logo} href="/" aria-label="J floor homepage">
					<img
						src="/assets/logos/j-floor-wordmark.svg"
						alt="J floor"
						width="128"
						height="40"
						loading="lazy"
					/>
				</a>
				<address class={styles.footerAddress}>
					{site.street}
					<br />
					{site.locality}
				</address>
				<p class={styles.footerRegistration}>{site.registration}</p>
			</div>
			<nav class={styles.footerGroup} aria-labelledby="footer-contact">
				<h2 id="footer-contact" class={styles.footerHeading}>
					Contact
				</h2>
				<a href={`mailto:${site.email}`}>{site.email}</a>
				<a href={site.privacy}>Privacy policy</a>
			</nav>
			<nav class={styles.footerGroup} aria-labelledby="footer-community">
				<h2 id="footer-community" class={styles.footerHeading}>
					Community
				</h2>
				<a href={site.apply}>Apply for membership</a>
				<a href={site.linkedin}>LinkedIn</a>
				<a href={site.luma}>Events on Luma</a>
			</nav>
		</footer>
	);
}
