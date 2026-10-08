import { For } from "solid-js";

import styles from "./PoweredBy.module.scss";

type Partner = {
	name: string;
	src: string;
	/** Rendered box on the live site (each logo has its own size there); the
	 * image is contained within it. */
	width: number;
	height: number;
};

// Partners + real logo files measured from the live ticker (thejfloor.com,
// "Powered by" section). The live site renders a continuous, seamless
// left-scrolling marquee of these 8 logos, self-hosted below.
const PARTNERS: Partner[] = [
	{
		name: "Founderful",
		src: "/assets/logos/founderful.svg",
		width: 178,
		height: 26,
	},
	{
		name: "Swisscom",
		src: "/assets/logos/swisscom.webp",
		width: 155,
		height: 54,
	},
	{
		name: "Alfred",
		src: "/assets/logos/alfred.svg",
		width: 95,
		height: 30,
	},
	{
		name: "Browser Use",
		src: "/assets/logos/browser-use.svg",
		width: 244,
		height: 36,
	},
	{
		name: "Earthling VC",
		src: "/assets/logos/earthling-vc.webp",
		width: 210,
		height: 22,
	},
	{
		name: "HITS",
		src: "/assets/logos/hits.svg",
		width: 108,
		height: 46,
	},
	{
		name: "Arc Investors",
		src: "/assets/logos/arc-investors.webp",
		width: 201,
		height: 56,
	},
	{
		name: "Project A",
		src: "/assets/logos/project-a.webp",
		width: 215,
		height: 58,
	},
];

/** One copy of the partner logos. `hidden` renders the duplicate copy used
 * to fill out the marquee loop: decorative, so it's hidden from assistive
 * tech and its images carry no alt text (the visible copy already names
 * every partner). */
function LogoSet(props: { hidden?: boolean }) {
	return (
		<ul class={styles.set} aria-hidden={props.hidden ? "true" : undefined}>
			<For each={PARTNERS}>
				{(partner) => (
					<li class={styles.item}>
						<img
							class={styles.logo}
							src={partner.src}
							width={partner.width}
							height={partner.height}
							alt={props.hidden ? "" : partner.name}
							loading="lazy"
						/>
					</li>
				)}
			</For>
		</ul>
	);
}

/** "Powered by" section: a monospace heading over a continuous, seamlessly
 * looping marquee of self-hosted partner logos. The logo set is rendered
 * twice back to back inside an overflow-hidden viewport; a CSS animation
 * translates the track by exactly one set's width so the loop never jumps.
 * Respects prefers-reduced-motion by freezing the animation and wrapping
 * a single, static copy instead. */
export function PoweredBy() {
	return (
		<section class={styles.section}>
			<h2 class={styles.heading}>Powered by</h2>
			<div class={styles.viewport}>
				<div class={styles.track}>
					<LogoSet />
					<LogoSet hidden />
				</div>
			</div>
		</section>
	);
}
