export type PlayerSlide = {
	id: string;
	kind: "image" | "html";
	durationSec: number;
	/** html: a document string rendered via srcdoc; image: a URL (https:, blob: or data:). */
	html?: string;
	imageUrl?: string;
};
export type Transition = "fade" | "slide" | "none";
export type Player = {
	setSlides(slides: readonly PlayerSlide[]): void;
	setTransition(transition: Transition): void;
	destroy(): void;
};
export type PlayerTimers = {
	setTimeout: (callback: () => void, ms: number) => unknown;
	clearTimeout: (handle: never) => void;
};
export type PlayerOptions = {
	slides: readonly PlayerSlide[];
	transition: Transition;
	/** Injectable for tests; defaults to `window`. */
	timers?: PlayerTimers;
};

const TRANSITION_MS = 600;
/** How long an incoming slide may take to load before it is shown anyway. */
const LOAD_TIMEOUT_MS = 3000;
/** HTML slides are laid out at this size (the J floor slide size) and scaled to the stage. */
const DESIGN_WIDTH = 3840;
const DESIGN_HEIGHT = 2160;
const HALF = 2;
const MS_PER_SECOND = 1000;
const TRANSITION_CLASSES = ["tvp-fade", "tvp-slide", "tvp-none"] as const;

type State = {
	stage: HTMLElement;
	timers: PlayerTimers;
	slides: PlayerSlide[];
	transition: Transition;
	current: number;
	layer: HTMLElement | undefined;
	advanceHandle: unknown;
	isAdvancing: boolean;
	leaving: Map<HTMLElement, unknown>;
	/** Layers built but not yet shown (still loading), each with its way to stop waiting. */
	pending: Map<HTMLElement, () => void>;
	observer: ResizeObserver | undefined;
};

/** Scales an HTML slide's fixed-size frame to the stage, centred. */
function fit(stage: HTMLElement, frame: HTMLElement): void {
	const width = stage.clientWidth;
	const height = stage.clientHeight;
	if (width === 0 || height === 0) return;
	const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
	const left = (width - DESIGN_WIDTH * scale) / HALF;
	const top = (height - DESIGN_HEIGHT * scale) / HALF;
	frame.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}

function fitAll(stage: HTMLElement): void {
	for (const frame of stage.querySelectorAll<HTMLElement>(
		".tvp-layer iframe"
	))
		fit(stage, frame);
}

function buildContent(slide: PlayerSlide): HTMLElement {
	if (slide.kind === "image") {
		const image = document.createElement("img");
		image.alt = "";
		if (slide.imageUrl) image.src = slide.imageUrl;
		return image;
	}
	const frame = document.createElement("iframe");
	frame.setAttribute("sandbox", "");
	frame.srcdoc = slide.html ?? "";
	return frame;
}

function sameContent(left: PlayerSlide, right: PlayerSlide): boolean {
	return (
		left.kind === right.kind &&
		left.html === right.html &&
		left.imageUrl === right.imageUrl
	);
}

function applyTransitionClass(state: State, element: HTMLElement): void {
	element.classList.remove(...TRANSITION_CLASSES);
	element.classList.add(`tvp-${state.transition}`);
}

function buildLayer(slide: PlayerSlide): HTMLElement {
	const element = document.createElement("div");
	element.className = "tvp-layer tvp-pending";
	element.dataset.slideId = slide.id;
	element.append(buildContent(slide));
	return element;
}

/** Calls `done` once the layer's content has loaded (or failed, or took too long). */
function whenLoaded(
	state: State,
	layer: HTMLElement,
	done: () => void
): () => void {
	const content = layer.firstElementChild;
	let isDone = false;
	function finish(): void {
		if (isDone) return;
		isDone = true;
		state.timers.clearTimeout(handle as never);
		content?.removeEventListener("load", finish);
		content?.removeEventListener("error", finish);
		done();
	}
	content?.addEventListener("load", finish);
	content?.addEventListener("error", finish);
	const handle = state.timers.setTimeout(finish, LOAD_TIMEOUT_MS);
	return () => {
		isDone = true;
		state.timers.clearTimeout(handle as never);
		content?.removeEventListener("load", finish);
		content?.removeEventListener("error", finish);
	};
}

function clearAdvance(state: State): void {
	if (state.isAdvancing)
		state.timers.clearTimeout(state.advanceHandle as never);
	state.isAdvancing = false;
}

function scheduleAdvance(state: State): void {
	clearAdvance(state);
	const slide = state.slides[state.current];
	if (!slide || state.slides.length < 2) return;
	state.isAdvancing = true;
	state.advanceHandle = state.timers.setTimeout(() => {
		state.isAdvancing = false;
		show(state, (state.current + 1) % state.slides.length);
	}, slide.durationSec * MS_PER_SECOND);
}

function retire(state: State, element: HTMLElement): void {
	state.leaving.set(
		element,
		state.timers.setTimeout(() => {
			state.leaving.delete(element);
			element.remove();
		}, TRANSITION_MS)
	);
}

/** Starts the transition of a loaded layer and lets every other shown layer leave. */
function reveal(state: State, incoming: HTMLElement): void {
	state.pending.delete(incoming);
	incoming.classList.remove("tvp-pending");
	applyTransitionClass(state, incoming);
	for (const layer of state.stage.querySelectorAll<HTMLElement>(".tvp-layer"))
		if (
			layer !== incoming &&
			!state.leaving.has(layer) &&
			!state.pending.has(layer)
		)
			retire(state, layer);
}

function dropPending(state: State): void {
	for (const [layer, cancel] of state.pending) {
		cancel();
		layer.remove();
	}
	state.pending.clear();
}

function show(state: State, index: number): void {
	state.current = index;
	const slide = state.slides[index];
	if (!slide) return;
	clearAdvance(state);
	dropPending(state);
	const incoming = buildLayer(slide);
	state.stage.append(incoming);
	const frame = incoming.querySelector<HTMLElement>("iframe");
	if (frame) fit(state.stage, frame);
	state.layer = incoming;
	scheduleAdvance(state);
	const isFirst = !state.stage.querySelector(".tvp-layer:not(.tvp-pending)");
	if (isFirst) {
		reveal(state, incoming);
		return;
	}
	// The incoming slide loads out of sight and fades in once it is drawn.
	state.pending.set(
		incoming,
		whenLoaded(state, incoming, () => {
			reveal(state, incoming);
		})
	);
}

function clearStage(state: State): void {
	clearAdvance(state);
	dropPending(state);
	for (const [element, handle] of state.leaving) {
		state.timers.clearTimeout(handle as never);
		element.remove();
	}
	state.leaving.clear();
	for (const layer of state.stage.querySelectorAll(".tvp-layer"))
		layer.remove();
	state.layer = undefined;
	state.current = -1;
}

/** The first slide at or after `from` in the old list that the new list still has, else the first. */
function nearestFollowing(
	state: State,
	old: readonly PlayerSlide[],
	from: number
): number {
	for (const slide of old.slice(from)) {
		const found = state.slides.findIndex(
			(candidate) => candidate.id === slide.id
		);
		if (found !== -1) return found;
	}
	return 0;
}

function replaceSlides(state: State, next: readonly PlayerSlide[]): void {
	const old = state.slides;
	const oldCurrent = old[state.current];
	state.slides = [...next];
	if (state.slides.length === 0) {
		clearStage(state);
		return;
	}
	if (!oldCurrent) {
		show(state, 0);
		return;
	}
	const kept = state.slides.findIndex((slide) => slide.id === oldCurrent.id);
	if (kept === -1) {
		show(state, nearestFollowing(state, old, state.current + 1));
		return;
	}
	state.current = kept;
	const slide = state.slides[kept];
	if (slide && state.layer && !sameContent(oldCurrent, slide)) {
		// Not replaceChildren: it needs Chrome 86, the Tizen 6 TV runs 76.
		state.layer.textContent = "";
		state.layer.append(buildContent(slide));
		const frame = state.layer.querySelector<HTMLElement>("iframe");
		if (frame) fit(state.stage, frame);
	}
	if (state.slides.length < 2) clearAdvance(state);
	else if (!state.isAdvancing) scheduleAdvance(state);
}

export function createPlayer(
	stage: HTMLElement,
	options: PlayerOptions
): Player {
	const state: State = {
		stage,
		timers: options.timers ?? window,
		slides: [],
		transition: options.transition,
		current: -1,
		layer: undefined,
		advanceHandle: undefined,
		isAdvancing: false,
		leaving: new Map(),
		pending: new Map(),
		observer: undefined,
	};
	if (typeof ResizeObserver !== "undefined") {
		state.observer = new ResizeObserver(() => {
			fitAll(stage);
		});
		state.observer.observe(stage);
	}
	replaceSlides(state, options.slides);
	return {
		setSlides: (slides) => {
			replaceSlides(state, slides);
		},
		setTransition: (transition) => {
			state.transition = transition;
			if (state.layer) applyTransitionClass(state, state.layer);
		},
		destroy: () => {
			state.observer?.disconnect();
			clearStage(state);
		},
	};
}
