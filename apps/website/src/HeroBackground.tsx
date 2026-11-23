import { createSignal, onCleanup, onMount, Show } from "solid-js";

import styles from "./HeroBackground.module.scss";

function createBackgroundController() {
	let video!: HTMLVideoElement;
	const [isPlaying, setPlaying] = createSignal(false);
	const [isReady, setReady] = createSignal(false);
	let isUserPaused = false;
	let syncPlayback: (() => void) | undefined;
	function toggle() {
		isUserPaused = isPlaying();
		syncPlayback?.();
	}
	onMount(() => {
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		const rect = video.parentElement!.getBoundingClientRect();
		let isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
		let isDisposed = false;
		function shouldPause() {
			return (
				reduced.matches ||
				document.hidden ||
				!isVisible ||
				isUserPaused ||
				isDisposed
			);
		}
		function sync() {
			if (shouldPause()) {
				video.pause();
				setPlaying(false);
				return;
			}
			video.muted = true;
			if (!video.getAttribute("src"))
				video.src = "/assets/hero/background.mp4";
			void video
				.play()
				.then(() => {
					if (shouldPause()) video.pause();
				})
				.catch(() => {
					setPlaying(false);
				});
		}
		syncPlayback = sync;
		const observer =
			typeof IntersectionObserver === "undefined"
				? undefined
				: new IntersectionObserver((entries) => {
						isVisible = entries[0]?.isIntersecting ?? false;
						sync();
					});
		observer?.observe(video.parentElement!);
		document.addEventListener("visibilitychange", sync);
		reduced.addEventListener("change", sync);
		sync();
		setReady(true);
		onCleanup(() => {
			isDisposed = true;
			video.pause();
			observer?.disconnect();
			document.removeEventListener("visibilitychange", sync);
			reduced.removeEventListener("change", sync);
		});
	});
	return {
		isPlaying,
		isReady,
		setPlaying,
		toggle,
		bindVideo: (element: HTMLVideoElement) => {
			video = element;
		},
	};
}
export function HeroBackground() {
	const { isPlaying, isReady, setPlaying, toggle, bindVideo } =
		createBackgroundController();
	return (
		<>
			<div
				class={styles.background}
				data-hero-background
				aria-hidden="true"
			>
				<img
					src="/assets/hero/poster.webp"
					alt=""
					width="1440"
					height="810"
					fetchpriority="high"
				/>
				<video
					ref={bindVideo}
					loop
					muted
					playsinline
					preload="none"
					poster="/assets/hero/poster.webp"
					onPlaying={() => {
						setPlaying(true);
					}}
					onPause={() => {
						setPlaying(false);
					}}
				/>
				<div class={styles.overlay} />
			</div>
			<BackgroundControl
				isReady={isReady()}
				isPlaying={isPlaying()}
				toggle={toggle}
			/>
		</>
	);
}

function BackgroundControl(props: {
	isReady: boolean;
	isPlaying: boolean;
	toggle: () => void;
}) {
	return (
		<Show when={props.isReady}>
			<button
				class={styles.control}
				type="button"
				onClick={() => {
					props.toggle();
				}}
				aria-label={
					props.isPlaying
						? "Pause background video"
						: "Play background video"
				}
				title={
					props.isPlaying
						? "Pause background video"
						: "Play background video"
				}
			>
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<Show
						when={props.isPlaying}
						fallback={<path d="m8 5 11 7-11 7Z" />}
					>
						<path d="M7 5h4v14H7zm6 0h4v14h-4z" />
					</Show>
				</svg>
			</button>
		</Show>
	);
}
