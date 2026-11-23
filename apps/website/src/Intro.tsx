import { For, onCleanup, onMount, type ParentProps, type JSX } from "solid-js";

import { HeroBackground } from "./HeroBackground.tsx";
import styles from "./Intro.module.scss";
import { enhanceIntro } from "./introMotion.ts";
import { introPhrases, introWords } from "./introTimeline.ts";

const INTRO_DESCRIPTION =
	"We are J floor, the space for innovation in Zurich. A community of founders.";

export function Intro(props: ParentProps<{ navigation?: JSX.Element }>) {
	let root!: HTMLElement;
	onMount(() => {
		onCleanup(enhanceIntro(root));
	});
	return (
		<section
			ref={(element) => {
				root = element;
			}}
			class={styles.intro}
			aria-label="Introducing J floor"
		>
			<p class={styles.accessible}>{INTRO_DESCRIPTION}</p>
			<div class={styles.stage} data-intro-stage>
				<HeroBackground />
				<div class={styles.composition} aria-hidden="true">
					<p class={styles.heading}>We are</p>
					<div class={styles.logo} data-intro-logo>
						<img
							class={styles.mark}
							data-intro-mark
							src="/assets/logos/j-floor-elevator.svg"
							width="256"
							height="136"
							alt=""
						/>
						<img
							class={styles.floor}
							data-intro-floor
							src="/assets/logos/j-floor-elevator-floor.svg"
							width="256"
							height="136"
							alt=""
						/>
					</div>
					<div class={styles.sentence} data-intro-sentence>
						<div class={styles.words}>
							<For each={Object.entries(introWords)}>
								{([key, word]) => (
									<span
										data-intro-word={key}
										data-initial={
											isInitialWord(key)
												? "true"
												: undefined
										}
									>
										{word}
									</span>
								)}
							</For>
						</div>
						<For each={introPhrases}>
							{(phrase) => (
								<div class={styles.probe} data-intro-probe>
									<For each={phrase}>
										{(word) => (
											<span data-word={word}>
												{introWords[word]}
											</span>
										)}
									</For>
								</div>
							)}
						</For>
					</div>
				</div>
				<div class={styles.heroLayer} data-intro-hero>
					<div class={styles.navigation} data-intro-navigation>
						{props.navigation}
					</div>
					{props.children}
				</div>
				<ScrollHint />
			</div>
		</section>
	);
}

function isInitialWord(key: string) {
	return key === "period" || introPhrases[0].some((word) => word === key);
}

function ScrollHint() {
	return (
		<span class={styles.scrollHint} data-scroll-hint aria-hidden="true">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m5 9 7 7 7-7" />
			</svg>
		</span>
	);
}
