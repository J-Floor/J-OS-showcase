import { Button } from "@j-os/design-system";

import { ImageCursorZone } from "../../../components/ImageCursorZone/ImageCursorZone.tsx";
import { RollLabel } from "../../../components/RollLabel/RollLabel.tsx";

import styles from "./WhoWeAre.module.scss";

const GROUP_PHOTO_SRC = "/assets/8yCCNbDpN3ooyUeuVY6dWzytrB0.webp";
const SPACE_PHOTO_SRC = "/assets/CsnGVvvq637deUILGhurxlplvug.webp";

/** "Who we are" section: a mono label, an editorial copy block, a Contact
 * pill, and two black-and-white photos of the J floor community and space.
 * The top row is a four-column grid (label / copy spanning two / pill), matching
 * the live thejfloor.com layout; the photos sit in a 2:1 split below. */
export function WhoWeAre() {
	return (
		<section class={styles.section}>
			<div class={styles.top}>
				<span class={styles.label}>Who we are</span>
				<div class={styles.copy}>
					<p class={styles.lead}>
						J floor is a community of founders, anchored around a
						space. In the heart of Zurich.
					</p>
					<p class={styles.body}>
						For solo founders and small teams at the earliest
						stages. Students, recent grads, big-tech dropouts, and
						anyone wired to build.
					</p>
					<p class={styles.body}>
						Everything early-stage fits here: messing around with
						tech, getting first customers, building momentum, …
					</p>
					<p class={styles.lead}>No equity. No fees.</p>
				</div>
				<div class={styles.contactCell}>
					<Button as="a" href="/contact" variant="pill-light">
						<RollLabel label="Contact" />
					</Button>
				</div>
			</div>
			<div class={styles.photos}>
				<ImageCursorZone label="The family">
					<img
						class={styles.photo}
						src={GROUP_PHOTO_SRC}
						alt="J floor community"
						loading="lazy"
					/>
				</ImageCursorZone>
				<ImageCursorZone label="The space">
					<img
						class={styles.photo}
						src={SPACE_PHOTO_SRC}
						alt="J floor space"
						loading="lazy"
					/>
				</ImageCursorZone>
			</div>
		</section>
	);
}
