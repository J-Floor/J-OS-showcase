// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { toasterCreate, update } = vi.hoisted(() => ({
	toasterCreate: vi.fn(),
	update: vi.fn(),
}));

vi.mock("../../../shared/toaster.ts", () => ({
	toaster: { create: toasterCreate },
}));
vi.mock("../data/tasksData.tsx", () => ({
	useProjectActions: () => ({ update }),
}));

import { DAY_MS } from "../../../../convex/lib/constants.ts";

import type { Timeline, TimelineBar } from "./timeline.ts";
import { createBarDrag } from "./timelineInteraction.ts";

const DAY_WIDTH = 20;
const START = 10 * DAY_MS;
const END = 14 * DAY_MS;
const TIMELINE = { dayWidth: DAY_WIDTH, totalDays: 100 } as Timeline;
const BAR = {
	id: "project-1",
	offset: 5,
	span: 5,
	startMs: START,
	endMs: END,
} as unknown as TimelineBar;

type Overrides = Record<string, { startMs: number; endMs: number }>;

let dispose: (() => void) | undefined;

function setup() {
	const onSelect = vi.fn();
	const [overrides, setOverrides] = createSignal<Overrides>({});
	const bars = createRoot((done) => {
		dispose = done;
		return createBarDrag({
			timeline: () => TIMELINE,
			setOverrides: setOverrides,
			onSelect,
		});
	});
	return { bars, onSelect, overrides };
}

function pointer(x: number, handle?: string): PointerEvent {
	const root = document.createElement("div");
	root.setPointerCapture = vi.fn();
	const target = document.createElement("span");
	if (handle) target.dataset.handle = handle;
	return {
		clientX: x,
		pointerId: 3,
		target,
		currentTarget: root,
	} as unknown as PointerEvent;
}

function dragBar(
	bars: ReturnType<typeof setup>["bars"],
	options: { handle?: string; from: number; to: number }
) {
	bars.barPointerDown(pointer(options.from, options.handle), BAR);
	bars.barPointerMove(pointer(options.to));
	bars.barPointerUp(pointer(options.to));
}

beforeEach(() => {
	update.mockReset().mockResolvedValue({ isErr: () => false });
	toasterCreate.mockReset();
});
afterEach(() => {
	dispose?.();
	dispose = undefined;
});

test("dragging the body shifts both dates by whole days and saves them", () => {
	const { bars, overrides } = setup();
	dragBar(bars, { from: 100, to: 100 + 3 * DAY_WIDTH });
	const moved = { startMs: START + 3 * DAY_MS, endMs: END + 3 * DAY_MS };
	expect(overrides()).toEqual({ "project-1": moved });
	expect(update).toHaveBeenCalledExactlyOnceWith({
		id: "project-1",
		startDate: moved.startMs,
		endDate: moved.endMs,
	});
});

test("dragging the start handle moves only the start, never past the end", () => {
	const { bars, overrides } = setup();
	dragBar(bars, { handle: "start", from: 100, to: 100 - 2 * DAY_WIDTH });
	expect(overrides()["project-1"]).toEqual({
		startMs: START - 2 * DAY_MS,
		endMs: END,
	});

	dragBar(bars, { handle: "start", from: 100, to: 100 + 30 * DAY_WIDTH });
	expect(overrides()["project-1"]).toEqual({ startMs: END, endMs: END });
});

test("dragging the end handle moves only the end, never before the start", () => {
	const { bars, overrides } = setup();
	dragBar(bars, { handle: "end", from: 100, to: 100 + 2 * DAY_WIDTH });
	expect(overrides()["project-1"]).toEqual({
		startMs: START,
		endMs: END + 2 * DAY_MS,
	});

	dragBar(bars, { handle: "end", from: 100, to: 100 - 30 * DAY_WIDTH });
	expect(overrides()["project-1"]).toEqual({ startMs: START, endMs: START });
});

test("a near-stationary press opens the project and saves nothing", () => {
	const { bars, onSelect, overrides } = setup();
	dragBar(bars, { from: 100, to: 103 });
	expect(onSelect).toHaveBeenCalledExactlyOnceWith("project-1");
	expect(update).not.toHaveBeenCalled();
	expect(overrides()).toEqual({});
});

test("a drag shorter than half a day changes nothing", () => {
	const { bars, onSelect, overrides } = setup();
	dragBar(bars, { from: 100, to: 100 + DAY_WIDTH / 2 - 1 });
	expect(update).not.toHaveBeenCalled();
	expect(onSelect).not.toHaveBeenCalled();
	expect(overrides()).toEqual({});
});

test("a release with no press does nothing", () => {
	const { bars, onSelect } = setup();
	bars.barPointerUp(pointer(300));
	expect(onSelect).not.toHaveBeenCalled();
	expect(update).not.toHaveBeenCalled();
});

test("the bar follows the pointer while dragged, and settles on release", () => {
	const { bars } = setup();
	expect(bars.barLeft(BAR, TIMELINE)).toBe(5 * DAY_WIDTH);
	expect(bars.barWidth(BAR, TIMELINE)).toBe(5 * DAY_WIDTH);

	bars.barPointerDown(pointer(100), BAR);
	bars.barPointerMove(pointer(140));
	expect(bars.barLeft(BAR, TIMELINE)).toBe(5 * DAY_WIDTH + 40);
	expect(bars.barWidth(BAR, TIMELINE)).toBe(5 * DAY_WIDTH);

	bars.barPointerUp(pointer(140));
	expect(bars.barLeft(BAR, TIMELINE)).toBe(5 * DAY_WIDTH);
});

test("resizing from the start moves the left edge and shrinks the width; the end only widens it", () => {
	const { bars } = setup();
	bars.barPointerDown(pointer(100, "start"), BAR);
	bars.barPointerMove(pointer(140));
	expect(bars.barLeft(BAR, TIMELINE)).toBe(5 * DAY_WIDTH + 40);
	expect(bars.barWidth(BAR, TIMELINE)).toBe(5 * DAY_WIDTH - 40);
	bars.barPointerUp(pointer(100));

	bars.barPointerDown(pointer(100, "end"), BAR);
	bars.barPointerMove(pointer(140));
	expect(bars.barLeft(BAR, TIMELINE)).toBe(5 * DAY_WIDTH);
	expect(bars.barWidth(BAR, TIMELINE)).toBe(5 * DAY_WIDTH + 40);
});

test("a refused save puts the bar back and says why", async () => {
	update.mockResolvedValue({
		isErr: () => true,
		error: { message: "Dates are not allowed." },
	});
	const { bars, overrides } = setup();
	dragBar(bars, { from: 100, to: 100 + 3 * DAY_WIDTH });
	expect(overrides()["project-1"]).toBeDefined();

	await vi.waitFor(() => {
		expect(overrides()).toEqual({});
	});
	expect(toasterCreate).toHaveBeenCalledExactlyOnceWith({
		type: "error",
		title: "Dates are not allowed.",
	});
});
