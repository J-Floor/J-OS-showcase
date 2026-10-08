import { Button } from "@j-os/design-system";

import { PillArrow } from "../../../components/Arrows/Arrows.tsx";
import { SITE_APPLY_URL } from "../../../site.ts";

import styles from "./Hero.module.scss";

/** Hero cityscape line-art (bridge/viaduct, buildings, mountains). Self-hosted
 * WebP under /public/assets — pulled off Framer's CDN and optimized so the
 * site has no runtime dependency on Framer. */
const CITYSCAPE_SRC = "/assets/eZifvSGGqSh0Vwk5J71T7ubpijs.webp";

/** Full-viewport hero: wordmark, headline, body copy, and the "Apply to
 * join" CTA over the line-art Zurich cityscape. */
export function Hero() {
	return (
		<section class={styles.hero}>
			<img class={styles.background} src={CITYSCAPE_SRC} alt="" />
			<div class={styles.content}>
				<p class={styles.wordmark}>J floor</p>
				<h1 class={styles.headline}>
					Build in Zurich.
					<br />
					Capture the world.
				</h1>
				<p class={styles.body}>
					We give brilliant founders the space to gather. A place to
					meet, commit, and believe before the world does.
				</p>
				<Button as="a" href={SITE_APPLY_URL} variant="pill">
					Apply to join
					<PillArrow class={styles.pillArrow} />
				</Button>
			</div>
		</section>
	);
}
