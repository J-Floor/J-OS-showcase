import styles from "./Testimonials.module.scss";

/** "In Their Words" testimonials section.
 *
 * The live site (https://thejfloor.com/) does not currently render a
 * testimonials section anywhere in its DOM. Per the brief, real testimonial quotes must never be
 * fabricated, so this renders the heading only, with a muted placeholder
 * line in place of testimonial cards until real quotes are available. */
export function Testimonials() {
	return (
		<section class={styles.section}>
			<h2 class={styles.heading}>
				In Their Words:
				<br />
				Why the Jfloor
				<br />
				Network Matters
			</h2>
			<p class={styles.placeholder}>Testimonials coming soon.</p>
		</section>
	);
}
