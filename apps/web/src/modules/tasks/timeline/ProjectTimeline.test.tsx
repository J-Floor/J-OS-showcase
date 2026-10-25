// @vitest-environment happy-dom
import { OWN_GESTURES_ATTR } from "@j-os/design-system";
import { cleanup, render, screen } from "@solidjs/testing-library";
import type { ComponentProps } from "solid-js";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

beforeAll(() => {
	if (!("ResizeObserver" in globalThis)) {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

import { DAY_MS } from "../../../../convex/lib/constants.ts";

import { ProjectTimeline } from "./ProjectTimeline.tsx";

type TimelineApi = Parameters<
	NonNullable<ComponentProps<typeof ProjectTimeline>["ref"]>
>[0];

const SCROLL = '[data-part="timeline-scroll"]';

function timeline(
	projects: never[] | undefined,
	onReady?: (api: TimelineApi) => void
) {
	return render(() => (
		<ProjectTimeline
			ref={onReady}
			projects={projects}
			people={[]}
			tasks={undefined}
			mode="week"
			onSelect={() => {}}
			onCreateRange={() => {}}
		/>
	));
}

const EMPTY_COPY = "No projects with a start and end date yet.";

test("projects undefined: skeleton rows, no empty copy", () => {
	timeline(undefined);
	expect(document.querySelector("[data-skeleton-list]")).toBeInTheDocument();
	expect(screen.queryByText(EMPTY_COPY)).toBeNull();
});

test("projects empty: empty copy, no skeleton", () => {
	timeline([]);
	expect(screen.getByText(EMPTY_COPY)).toBeInTheDocument();
	expect(document.querySelector("[data-skeleton-list]")).toBeNull();
});

/** No layout here: report the scroll element's size once it is observed. */
function reportLayout(resizes: (() => void)[]) {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			readonly callback: ResizeObserverCallback;
			constructor(callback: ResizeObserverCallback) {
				this.callback = callback;
			}
			observe() {
				const entry = {
					contentRect: { width: LAID_OUT_WIDTH },
				} as ResizeObserverEntry;
				resizes.push(() => {
					this.callback([entry], {} as ResizeObserver);
				});
			}
			unobserve() {}
			disconnect() {}
		}
	);
}

const FOUR_MONTHS = 120 * DAY_MS;
const LAID_OUT_WIDTH = 300;

test("opens scrolled to today when every project is months ago", () => {
	const resizes: (() => void)[] = [];
	reportLayout(resizes);
	const now = Date.now();
	const project = {
		_id: "p1",
		name: "Roof",
		startDate: now - FOUR_MONTHS - DAY_MS * 3,
		endDate: now - FOUR_MONTHS,
	};
	const { container } = timeline([project as never]);
	for (const resize of resizes) resize();
	const scroller = container.querySelector<HTMLElement>(SCROLL);
	expect(scroller?.scrollLeft).toBeGreaterThan(0);
	expect(
		container.querySelector('[data-part="timeline-today"]')
	).not.toBeNull();
});

test("the ref hands out scrollToToday, which recentres on today", () => {
	const resizes: (() => void)[] = [];
	reportLayout(resizes);
	const now = Date.now();
	const project = {
		_id: "p1",
		name: "Roof",
		startDate: now - DAY_MS,
		endDate: now + DAY_MS,
	};
	let api: TimelineApi | undefined;
	const { container } = timeline([project as never], (handle) => {
		api = handle;
	});
	for (const resize of resizes) resize();
	const scroller = container.querySelector<HTMLElement>(SCROLL)!;
	const opened = scroller.scrollLeft;
	scroller.scrollLeft = 0;
	api?.scrollToToday();
	expect(opened).toBeGreaterThan(0);
	expect(scroller.scrollLeft).toBe(opened);
});

test("bars and the new-range row handle their own drags, so a tab swipe never starts on them", () => {
	const now = Date.now();
	const project = {
		_id: "p1",
		name: "Roof",
		startDate: now - DAY_MS,
		endDate: now + DAY_MS,
	};
	const { container } = timeline([project as never]);
	expect(screen.getByTitle("Roof")).toHaveAttribute(OWN_GESTURES_ATTR);
	expect(
		container.querySelector('[data-part="timeline-new-row"]')
	).toHaveAttribute(OWN_GESTURES_ATTR);
});
