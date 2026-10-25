// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("convex-solidjs", () => ({ useMutation: () => ({}) }));
vi.mock("../../../../convex/_generated/api", () => ({ api: {} }));

import type { Timeline, ViewMode } from "./timeline.ts";
import {
	createTimelinePadding,
	createTimelineScroll,
} from "./timelineInteraction.ts";

const DAY_WIDTH = 16;
const TODAY_OFFSET = 100;
// Today, less the two lead days the jump keeps on its left.
const TODAY_SCROLL_LEFT = (TODAY_OFFSET - 2) * DAY_WIDTH;
const CANVAS_WIDTH = 4000;
const VIEWPORT_WIDTH = 300;

/** The ResizeObserver callback for each observed element: the test reports
 *  sizes itself, as there is no layout here. */
const observed = new Map<Element, ResizeObserverCallback>();

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			readonly callback: ResizeObserverCallback;
			constructor(callback: ResizeObserverCallback) {
				this.callback = callback;
			}
			observe(target: Element) {
				observed.set(target, this.callback);
			}
			unobserve() {}
			disconnect() {}
		}
	);
});

afterEach(() => {
	observed.clear();
	vi.unstubAllGlobals();
});

/** The element gets laid out at `width` (0 while its tab is hidden). */
function resize(element: HTMLDivElement, width: number): void {
	const entry = { contentRect: { width } } as ResizeObserverEntry;
	observed.get(element)?.([entry], {} as ResizeObserver);
}

function stubTimeline(): Timeline {
	return { todayOffset: TODAY_OFFSET, dayWidth: DAY_WIDTH } as Timeline;
}

/** A scroll element as it mounts: scrolled to the far left. */
function stubElement(): HTMLDivElement {
	return {
		scrollLeft: 0,
		scrollWidth: CANVAS_WIDTH,
		clientWidth: VIEWPORT_WIDTH,
	} as HTMLDivElement;
}

function setup(initial: Timeline | null) {
	return createRoot((dispose) => {
		const [mode] = createSignal<ViewMode>("week");
		const [timeline, setTimeline] = createSignal<Timeline | null>(initial);
		const padding = createTimelinePadding({ mode });
		const scroll = createTimelineScroll({
			mode,
			padding,
			timeline,
		});
		return { dispose, padding, scroll, setTimeline };
	});
}

test("scrolls to today once the scroll element is laid out", () => {
	const { dispose, scroll } = setup(stubTimeline());
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, VIEWPORT_WIDTH);
	expect(element.scrollLeft).toBe(TODAY_SCROLL_LEFT);
	dispose();
});

test("scrolls to today once the timeline arrives after the element", () => {
	const { dispose, scroll, setTimeline } = setup(null);
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, VIEWPORT_WIDTH);
	expect(element.scrollLeft).toBe(0);
	setTimeline(stubTimeline());
	expect(element.scrollLeft).toBe(TODAY_SCROLL_LEFT);
	dispose();
});

test("waits while the panel is hidden, and jumps when it is shown", () => {
	const { dispose, scroll } = setup(stubTimeline());
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, 0);
	expect(element.scrollLeft).toBe(0);
	resize(element, VIEWPORT_WIDTH);
	expect(element.scrollLeft).toBe(TODAY_SCROLL_LEFT);
	dispose();
});

test("does not jump again when the timeline changes or resizes later", () => {
	const { dispose, scroll, setTimeline } = setup(stubTimeline());
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, VIEWPORT_WIDTH);
	element.scrollLeft = 900;
	setTimeline(stubTimeline());
	resize(element, VIEWPORT_WIDTH + 1);
	expect(element.scrollLeft).toBe(900);
	dispose();
});

test("scrollToToday recentres on today after the user scrolled away", () => {
	const { dispose, scroll } = setup(stubTimeline());
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, VIEWPORT_WIDTH);
	element.scrollLeft = 900;
	scroll.scrollToToday();
	expect(element.scrollLeft).toBe(TODAY_SCROLL_LEFT);
	dispose();
});

test("scrollToToday does nothing while there is no timeline", () => {
	const { dispose, scroll } = setup(null);
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, VIEWPORT_WIDTH);
	element.scrollLeft = 900;
	scroll.scrollToToday();
	expect(element.scrollLeft).toBe(900);
	dispose();
});

test("the left edge does not grow the range before the first jump", () => {
	const { dispose, padding, scroll } = setup(stubTimeline());
	const element = stubElement();
	scroll.setScrollElement(element);
	resize(element, 0);
	const before = padding.padBefore();
	scroll.onScroll();
	expect(padding.padBefore()).toBe(before);
	dispose();
});

test("a remounted scroll element opens on today again", () => {
	const { dispose, scroll } = setup(stubTimeline());
	const first = stubElement();
	scroll.setScrollElement(first);
	resize(first, VIEWPORT_WIDTH);
	const remounted = stubElement();
	scroll.setScrollElement(remounted);
	resize(remounted, VIEWPORT_WIDTH);
	expect(remounted.scrollLeft).toBe(TODAY_SCROLL_LEFT);
	dispose();
});
