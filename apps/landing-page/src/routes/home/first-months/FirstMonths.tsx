import {
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	untrack,
} from "solid-js";

import styles from "./FirstMonths.module.scss";

const STAT_COUNT_UP_DURATION_MS = 1800;

/** Ease-out quad: fast start, gentle settle — matches the live site's
 * count-up feel. */
function easeOutQuad(progress: number): number {
	return 1 - (1 - progress) * (1 - progress);
}

/** Splits a stat string like "115+" or "27M+" into its numeric target and
 * the trailing suffix ("+" / "M+") that stays attached to it while it
 * counts up. */
function parseStatValue(value: string): { target: number; suffix: string } {
	const match = /^(\d+)(.*)$/.exec(value);
	if (!match) {
		return { target: 0, suffix: value };
	}
	return { target: Number(match[1]), suffix: match[2] };
}

/** A stat number that counts up from 0 to its target the first time it
 * scrolls into view, mirroring the live site's animation. Shows the final
 * value immediately for visitors who prefer reduced motion, or when
 * IntersectionObserver isn't available (e.g. in tests) — the rendered text
 * content is always the real value, animated or not. */
function StatNumber(props: { value: string }) {
	const parsed = createMemo(() => parseStatValue(props.value));
	// Starts at the real value so the prerendered HTML (and crawlers) carry it;
	// the browser resets it to 0 on mount before counting up.
	const [count, setCount] = createSignal(untrack(parsed).target);
	let ref: HTMLParagraphElement | undefined;
	let frame: number | undefined;

	function animate(target: number) {
		const start = performance.now();
		function tick(now: number) {
			const progress = Math.min(
				(now - start) / STAT_COUNT_UP_DURATION_MS,
				1
			);
			setCount(Math.round(target * easeOutQuad(progress)));
			frame = progress < 1 ? requestAnimationFrame(tick) : undefined;
		}
		frame = requestAnimationFrame(tick);
	}

	function readPrefersReducedMotion(): boolean {
		try {
			return window.matchMedia("(prefers-reduced-motion: reduce)")
				.matches;
		} catch {
			return false;
		}
	}

	onMount(() => {
		const target = parsed().target;

		if (
			readPrefersReducedMotion() ||
			typeof IntersectionObserver === "undefined" ||
			!ref
		) {
			setCount(target);
			return;
		}

		setCount(0);
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						animate(target);
						observer.disconnect();
					}
				}
			},
			{ threshold: 0.4 }
		);
		observer.observe(ref);

		onCleanup(() => {
			observer.disconnect();
			if (frame !== undefined) {
				cancelAnimationFrame(frame);
			}
		});
	});

	return (
		<p class={styles.statNumber} ref={(el) => (ref = el)}>
			{count()}
			{parsed().suffix}
		</p>
	);
}

/** "Our first 6 months" section: a monospace label paired with intro copy,
 * a three-column stats row (active founders / projects / raised) whose
 * numbers count up into view, and a wide black-and-white photo with a
 * caption. */
export function FirstMonths() {
	return (
		<section class={styles.section}>
			<div class={styles.intro}>
				<h2 class={styles.label}>Our first 6 months</h2>

				<div class={styles.copy}>
					<p class={styles.paragraph}>
						J floor grew out of a community of builders at ETH and,
						since opening its first spaces in February 2026, has
						become the reference point for ambitious early-stage
						founders in Zurich.
					</p>
					<p class={styles.paragraph}>
						Founders build alongside each other, share knowledge and
						connections, and help turn early projects into funded
						companies.
					</p>
					<p class={styles.paragraph}>
						The recipe is still simple: Fill a room with brilliant
						people and let the magic happen.
					</p>
				</div>
			</div>

			<div class={styles.stats}>
				<div class={styles.statCell}>
					<p class={styles.statLabel}>Active founders</p>
					<StatNumber value="115+" />
				</div>
				<div class={styles.statCell}>
					<p class={styles.statLabel}>Projects</p>
					<StatNumber value="55+" />
				</div>
				<div class={styles.statCell}>
					<p class={styles.statLabel}>Raised by members</p>
					<StatNumber value="27M+" />
				</div>
			</div>

			<figure class={styles.photo}>
				<img
					alt="Founders working together on the original floor J"
					class={styles.photoImage}
					decoding="async"
					loading="lazy"
					src="/assets/3cfLVdnEsG8wFh3JIG8cM4tzw0.webp"
				/>
				<figcaption class={styles.caption}>
					The original floor J (2025)
				</figcaption>
			</figure>
		</section>
	);
}
