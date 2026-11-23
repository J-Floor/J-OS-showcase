import { onCleanup, onMount, Show } from "solid-js";

import { Footer } from "./Footer.tsx";
import { revealHeaderOnScroll } from "./headerReveal.ts";
import { Home } from "./Home.tsx";
import { enhanceEntrances } from "./motion.ts";
import { site } from "./site.ts";
import styles from "./Website.module.scss";
function Header(props: { isHome: boolean }) {
	let header!: HTMLElement;
	onMount(() => {
		if (props.isHome) onCleanup(revealHeaderOnScroll(header));
	});
	return (
		<header
			ref={(element) => {
				header = element;
			}}
			class={styles.header}
			data-site-header
			data-home-header={props.isHome ? "" : undefined}
		>
			<a class={styles.logo} href="/" aria-label="J floor homepage">
				<img
					src="/assets/logos/j-floor-wordmark.svg"
					alt="J floor"
					width="128"
					height="40"
				/>
			</a>
			<nav aria-label="Main navigation">
				<a href="/#community">Community</a>
				{/* <a href="/#events">Events</a> */}
				<a href={site.contact}>Contact</a>
				<a class={styles.primary} href={site.apply}>
					Apply for membership <span aria-hidden="true">↗</span>
				</a>
			</nav>
		</header>
	);
}
function Contact() {
	return (
		<section class={styles.innerPage}>
			<p class={styles.label}>Contact</p>
			<h1>
				Let’s start
				<br />a conversation.
			</h1>
			<p class={styles.intro}>
				A question about the community, an event, or supporting what’s
				next for Zurich? We’d like to hear from you.
			</p>
			<a class={styles.contactLink} href={`mailto:${site.email}`}>
				{site.email} ↗
			</a>
			<div class={styles.actions}>
				<a class={styles.primary} href={site.apply}>
					Apply for membership ↗
				</a>
				<a href={site.linkedin}>Find us on LinkedIn ↗</a>
			</div>
		</section>
	);
}
function NotFound() {
	return (
		<section class={styles.innerPage}>
			<p class={styles.label}>404 · Page not found</p>
			<h1>
				A different
				<br />
				way home.
			</h1>
			<p>This page isn’t here. The community is.</p>
			<a class={styles.primary} href="/">
				Back to J floor
			</a>
		</section>
	);
}
export function App(props: { path: string; now: number }) {
	let root!: HTMLDivElement;
	onMount(() => {
		onCleanup(enhanceEntrances(root));
	});
	return (
		<div
			ref={(element) => {
				root = element;
			}}
			class={styles.website}
		>
			<a
				class={styles.skip}
				onClick={(event) => {
					const intro =
						document.querySelector<HTMLElement>("[data-enhanced]");
					if (props.path !== "/" || !intro) return;
					event.preventDefault();
					intro.dispatchEvent(new Event("intro-skip"));
					document
						.getElementById("home-content")
						?.focus({ preventScroll: true });
				}}
				href={props.path === "/" ? "#home-content" : "#main"}
			>
				Skip to content
			</a>
			<Header isHome={props.path === "/"} />
			<main id="main" tabIndex={-1}>
				<Show
					when={props.path === "/"}
					fallback={
						<Show
							when={props.path === "/contact"}
							fallback={<NotFound />}
						>
							<Contact />
						</Show>
					}
				>
					<Home />
				</Show>
			</main>
			<Footer />
		</div>
	);
}
