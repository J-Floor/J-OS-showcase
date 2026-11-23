import { createIntroPlayback } from "./introPlayback.ts";
import { introState, type IntroWord } from "./introTimeline.ts";

type Position = { x: number; y: number };
type Layout = Partial<Record<IntroWord, Position>>;

function createRenderer(root: HTMLElement) {
	const sentence = root.querySelector<HTMLElement>("[data-intro-sentence]")!;
	const mark = root.querySelector<HTMLImageElement>("[data-intro-mark]")!;
	const floor = root.querySelector<HTMLImageElement>("[data-intro-floor]")!;
	const logo = root.querySelector<HTMLElement>("[data-intro-logo]")!;
	const probes = [
		...root.querySelectorAll<HTMLElement>("[data-intro-probe]"),
	];
	const words = [...root.querySelectorAll<HTMLElement>("[data-intro-word]")];
	let layouts: Layout[] = [];
	let logoShift = 0;
	function measure() {
		sentence.style.blockSize = "";
		prepareFinale(root, sentence);
		const height = Math.max(
			copyHeight(root),
			sentence.offsetHeight,
			...probes.map((probe) => probe.offsetHeight)
		);
		sentence.style.blockSize = `${height}px`;
		reserveActions(root, height);
		const origin = sentence.getBoundingClientRect();
		positionFinale(root, origin);
		const periodWidth = words
			.find((word) => word.dataset.introWord === "period")!
			.getBoundingClientRect().width;
		layouts = probes.map((probe) => {
			const layout: Layout = {};
			for (const element of probe.querySelectorAll<HTMLElement>(
				"[data-word]"
			)) {
				const rect = element.getBoundingClientRect();
				layout[element.dataset.word as IntroWord] = {
					x: rect.left - origin.left,
					y: rect.top - origin.top,
				};
			}
			const last = probe.lastElementChild!.getBoundingClientRect();
			layout.period = {
				x: last.right - origin.left - periodWidth,
				y: last.top - origin.top,
			};
			return layout;
		});
		// Center the 60-unit elevator frame inside the 256-unit lockup.
		logoShift = (logo.getBoundingClientRect().width * 98) / 256;
	}
	function draw(progress: number) {
		const state = introState(progress);
		const previous = layouts[state.from];
		const next = layouts[state.to];
		for (const word of words) {
			const key = word.dataset.introWord as IntroWord;
			const from = previous[key];
			const to = next[key];
			const start = from ?? to;
			const end = to ?? from;
			if (!start || !end) {
				word.style.opacity = "0";
				word.style.transform = "none";
				continue;
			}
			const opacity = wordOpacity(Boolean(from), Boolean(to), state.mix);
			const offset = wordOffset(Boolean(from), Boolean(to), state.mix);
			const x = start.x + (end.x - start.x) * state.mix;
			const y = start.y + (end.y - start.y) * state.mix + offset;
			word.style.opacity = String(opacity);
			word.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		}
		sentence.style.opacity = String(state.sentenceOpacity);
		mark.style.setProperty(
			"--intro-mark-x",
			`${logoShift * (1 - state.logoProgress)}px`
		);
		floor.style.setProperty(
			"--intro-floor-opacity",
			String(state.logoProgress)
		);
	}
	return { measure, draw };
}

function wordOpacity(isFrom: boolean, isTo: boolean, mix: number) {
	if (isFrom && isTo) return 1;
	return isTo ? mix : 1 - mix;
}

function wordOffset(isFrom: boolean, isTo: boolean, mix: number) {
	if (isFrom && isTo) return 0;
	return isTo ? 8 * (1 - mix) : -8 * mix;
}

export function enhanceIntro(root: HTMLElement) {
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");
	const stage = root.querySelector<HTMLElement>("[data-intro-stage]")!;
	const renderer = createRenderer(root);
	const scene = createSceneRenderer(root);
	let start = 0;
	let distance = 1;
	let isDisposed = false;
	const playback = createIntroPlayback((story, reveal) => {
		renderer.draw(story);
		scene(story, reveal);
	}, reduced);
	function schedule() {
		delete root.dataset.arrival;
		if (window.scrollY > 8) playback.requestReveal();
	}
	function measure() {
		if (isDisposed || reduced.matches) return;
		root.dataset.enhanced = "true";
		renderer.measure();
		measureOpeningOffset(root);
		start = root.getBoundingClientRect().top + window.scrollY;
		distance = Math.max(1, root.offsetHeight - stage.offsetHeight);
		playback.refresh();
		playback.start();
	}
	function preference() {
		const oldScroll = window.scrollY;
		// Collapse here, rather than in CSS, to preserve the reader's position.
		const oldHeight = root.hasAttribute("data-enhanced")
			? distance + stage.offsetHeight
			: root.offsetHeight;
		const oldBottom = start + oldHeight - oldScroll;
		if (reduced.matches) {
			delete root.dataset.enhanced;
			playback.settle();
		} else measure();
		const delta = root.offsetHeight - oldHeight;
		if (oldBottom <= 0) window.scrollTo(0, oldScroll + delta);
		else if (oldScroll > start) window.scrollTo(0, start);
	}
	const navigationCleanup = bindIntroNavigation(root, () => {
		if (reduced.matches) return;
		playback.revealNow();
	});
	const observer =
		typeof ResizeObserver === "undefined"
			? undefined
			: new ResizeObserver(measure);
	observer?.observe(stage);
	window.addEventListener("scroll", schedule, { passive: true });
	window.addEventListener("resize", measure);
	window.addEventListener("pageshow", measure);
	document.addEventListener("visibilitychange", schedule);
	reduced.addEventListener("change", preference);
	measure();
	if (!reduced.matches && window.scrollY === 0 && !location.hash)
		root.dataset.arrival = "true";
	if (typeof document.fonts !== "undefined")
		void document.fonts.ready.then(measure);
	return () => {
		isDisposed = true;
		playback.dispose();
		observer?.disconnect();
		window.removeEventListener("scroll", schedule);
		window.removeEventListener("resize", measure);
		window.removeEventListener("pageshow", measure);
		document.removeEventListener("visibilitychange", schedule);
		reduced.removeEventListener("change", preference);
		delete root.dataset.enhanced;
		navigationCleanup();
	};
}

function createSceneRenderer(root: HTMLElement) {
	const hero = root.querySelector<HTMLElement>("[data-intro-hero]")!;
	return (progress: number, controls: number) => {
		const reveal = Math.min(1, Math.max(0, (controls - 0.3) / 0.7));
		positionOpening(root, controls);
		root.style.setProperty(
			"--intro-heading-opacity",
			String(1 - Math.min(1, Math.max(0, (progress - 0.97) / 0.06)))
		);

		root.style.setProperty(
			"--intro-tagline-opacity",
			String(Math.min(1, Math.max(0, (progress - 1.04) / 0.08)))
		);
		root.style.setProperty(
			"--intro-apply-opacity",
			String(Math.min(1, Math.max(0, (reveal - 0.3) / 0.4)))
		);
		root.style.setProperty(
			"--intro-events-opacity",
			String(Math.min(1, Math.max(0, (reveal - 0.6) / 0.4)))
		);
		root.style.setProperty(
			"--intro-hero-visibility",
			reveal > 0 || progress > 1.04 ? "visible" : "hidden"
		);
		root.style.setProperty("--intro-nav-opacity", String(reveal));
		root.style.setProperty("--intro-nav-y", `${-12 * (1 - reveal)}px`);
		hero.inert = reveal === 0 && progress <= 1.04;
		hero.setAttribute(
			"aria-hidden",
			String(reveal === 0 && progress <= 1.04)
		);
	};
}

function bindIntroNavigation(root: HTMLElement, jump: () => void) {
	function focus(event: FocusEvent) {
		if (
			event.target instanceof Element &&
			event.target.closest("[data-intro-hero]")
		)
			jump();
	}
	root.addEventListener("focusin", focus);
	root.addEventListener("intro-skip", jump);
	return () => {
		root.removeEventListener("focusin", focus);
		root.removeEventListener("intro-skip", jump);
	};
}

function positionFinale(root: HTMLElement, sentence: DOMRect) {
	const stage = root
		.querySelector<HTMLElement>("[data-intro-stage]")!
		.getBoundingClientRect();
	root.style.setProperty(
		"--intro-finale-top",
		`${sentence.top - stage.top}px`
	);
	root.style.setProperty(
		"--intro-finale-left",
		`${sentence.left - stage.left}px`
	);
	root.style.setProperty("--intro-finale-width", `${sentence.width}px`);
}

function copyHeight(root: HTMLElement) {
	root.style.removeProperty("--intro-copy-height");
	return (
		root.querySelector<HTMLElement>("[data-intro-tagline]")?.offsetHeight ??
		0
	);
}

function reserveActions(root: HTMLElement, height: number) {
	root.style.setProperty("--intro-copy-height", `${height}px`);
	const finale = root.querySelector<HTMLElement>("[data-intro-finale]");
	if (!finale) return;
	const reserve = Math.max(
		0,
		finale.offsetHeight -
			height +
			Number.parseFloat(getComputedStyle(finale).marginBlockStart || "0")
	);
	root.style.setProperty("--intro-action-reserve", `${reserve}px`);
}

function prepareFinale(root: HTMLElement, sentence: HTMLElement) {
	root.style.setProperty("--intro-opening-y", "0px");
	root.style.setProperty(
		"--intro-navigation-height",
		`${document.querySelector<HTMLElement>("[data-site-header]")?.getBoundingClientRect().height ?? 0}px`
	);
	root.style.setProperty(
		"--intro-finale-width",
		`${sentence.getBoundingClientRect().width}px`
	);
}

function measureOpeningOffset(root: HTMLElement) {
	const logo = root
		.querySelector<HTMLElement>("[data-intro-logo]")!
		.getBoundingClientRect();
	const stage = root
		.querySelector<HTMLElement>("[data-intro-stage]")!
		.getBoundingClientRect();
	const heading = root
		.querySelector<HTMLElement>("[data-intro-stage] p")!
		.getBoundingClientRect();
	const sentence = root
		.querySelector<HTMLElement>("[data-intro-sentence]")!
		.getBoundingClientRect();
	const headerBottom =
		document
			.querySelector<HTMLElement>("[data-site-header]")
			?.getBoundingClientRect().bottom ?? 0;
	const target = window.innerHeight / 2;
	const wanted = target - (logo.top + logo.height / 2);
	const minimum = headerBottom + 16 - heading.top;
	const maximum = stage.bottom - 32 - sentence.bottom;
	const offset = Math.max(minimum, Math.min(maximum, wanted));
	root.style.setProperty("--intro-opening-offset", String(offset));
}
function positionOpening(root: HTMLElement, reveal: number) {
	const offset = Number(
		root.style.getPropertyValue("--intro-opening-offset")
	);
	root.style.setProperty("--intro-opening-y", `${offset * (1 - reveal)}px`);
}
