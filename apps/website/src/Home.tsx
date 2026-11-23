import { For } from "solid-js";

import { metrics, photoSlots } from "./content.ts";
import { CountUp } from "./CountUp.tsx";
// Events section is hidden for now; restore this import with <Events /> below.
// import { Events } from "./Events.tsx";
import { Intro } from "./Intro.tsx";
import { Partners } from "./Partners.tsx";
import { site } from "./site.ts";
import styles from "./Website.module.scss";
function Photo(props: { index: number }) {
	function photo() {
		return photoSlots[props.index];
	}
	return (
		<figure
			class={styles.photo}
			data-kind={photo().ratio}
			data-entrance="image"
		>
			<div class={styles.photoField}>
				<img
					src={photo().src}
					alt={photo().alt}
					width={photo().width}
					height={photo().height}
					loading="lazy"
					decoding="async"
					style={{ "--photo-position": photo().position }}
				/>
			</div>
			<figcaption>{photo().title}</figcaption>
		</figure>
	);
}
function Community() {
	return (
		<section
			id="community"
			class={styles.section}
			aria-labelledby="community-title"
		>
			<div class={styles.editorial}>
				<div data-entrance="heading">
					<h2 id="community-title">
						Build, ship, grow.
						<br />
						In the heart of Zurich.
					</h2>
				</div>
				<div class={styles.prose}>
					<p class={styles.intro}>
						J floor is a community of founders, anchored around a
						space.
						<br />
						In the heart of Zurich.
					</p>
					<p>
						For solo founders and small teams at the earliest
						stages. Students, recent grads, big-tech dropouts, and
						anyone wired to build.
					</p>
					<p>
						Show up. Share what you know. Build alongside people who
						do the same. No batches or fixed programs. A community
						that grows with its members.
					</p>
				</div>
			</div>
			<div class={styles.communitySequence}>
				<Momentum />
				<div class={styles.photoGallery}>
					<Photo index={0} />
					<div class={styles.photoPair}>
						<Photo index={1} />
						<Photo index={2} />
					</div>
				</div>
			</div>
		</section>
	);
}
function Momentum() {
	return (
		<section class={styles.momentum} aria-labelledby="momentum-title">
			<div class={styles.momentumIntro}>
				<p class={styles.label}>Momentum</p>
				<h3 id="momentum-title">
					Individual ambition. Shared momentum.
				</h3>
			</div>
			<dl class={styles.metrics}>
				<For each={metrics}>
					{(metric) => (
						<div>
							<dt>{metric.label}</dt>
							<dd>
								<CountUp {...metric} />
							</dd>
						</div>
					)}
				</For>
			</dl>
		</section>
	);
}
function Vision() {
	return (
		<section class={styles.section} aria-labelledby="zurich-title">
			<div data-entrance="heading" class={styles.sectionIntro}>
				<p class={styles.label}>Built for Zurich</p>
				<h2 id="zurich-title">
					Rooted here.
					<br />
					Looking ahead.
				</h2>
			</div>
			<ol class={styles.timeline} role="list">
				<li>
					<p class={styles.label}>
						<time dateTime="2026-04">April 2026</time>
					</p>
					<h3>A shared beginning.</h3>
					<p>
						Rooted in a community of builders at ETH, J floor
						officially opened its doors in Zurich.
					</p>
				</li>
				<li>
					<p class={styles.label}>Since then</p>
					<h3>Growing together.</h3>
					<p>
						Founders building side by side, sharing knowledge and
						connections, and turning early projects into funded
						companies.
					</p>
				</li>
				<li>
					<p class={styles.label}>Looking ahead</p>
					<h3>An enduring home.</h3>
					<p>
						Bringing Zurich’s builders, researchers, and founders
						together. A lasting home for shared ambition and ideas
						moving forward.
					</p>
				</li>
			</ol>
			<Partners />
		</section>
	);
}
export function Home() {
	return (
		<>
			<Intro>
				<section
					id="home-content"
					data-intro-finale
					tabIndex={-1}
					class={styles.finale}
					aria-labelledby="opening-title"
				>
					<h1 id="opening-title" data-intro-tagline>
						Build in Zurich. Capture the world.
					</h1>
					<div class={styles.finaleActions}>
						<a
							class={styles.primary}
							data-intro-apply
							href={site.apply}
						>
							Apply for membership{" "}
							<span aria-hidden="true">↗</span>
						</a>
						{/* <a data-intro-events href="#events">
							Explore events <span aria-hidden="true">↓</span>
						</a> */}
					</div>
				</section>
			</Intro>
			<Community />
			{/* <Events now={props.now} /> */}
			<Vision />
			<section
				class={styles.invitation}
				aria-labelledby="invitation-title"
			>
				<p class={styles.label}>Your next chapter</p>
				<h2 id="invitation-title">
					Bring what you’re building.
					<br />
					And who you are.
				</h2>
				<p>
					Exploring an idea, finding your footing, or building again?
					There’s room for different stages and perspectives. Come
					ready to participate and contribute.
				</p>
				<div class={styles.actions}>
					<a class={styles.primary} href={site.apply}>
						Apply for membership <span aria-hidden="true">↗</span>
					</a>
					<span>No equity. No fees.</span>
				</div>
			</section>
		</>
	);
}
