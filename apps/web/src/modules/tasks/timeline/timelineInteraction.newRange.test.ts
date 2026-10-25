// @vitest-environment happy-dom
import { viewTransition } from "@j-os/design-system";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("convex-solidjs", () => ({ useMutation: () => ({}) }));
vi.mock("../../../../convex/_generated/api", () => ({ api: {} }));

import type { Timeline } from "./timeline.ts";
import { createNewRangeDrag } from "./timelineInteraction.ts";

const DAY_WIDTH = 10;

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition");
	vi.unstubAllGlobals();
});

/** View Transitions that finish only when `finish` is called. */
function holdTransitions(): () => void {
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	Object.assign(document, {
		startViewTransition: (update: () => Promise<void> | void) => {
			const updated = Promise.resolve().then(update);
			return { finished, updateCallbackDone: updated, ready: updated };
		},
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	return () => {
		finish();
	};
}

const row = document.createElement("div");
row.setPointerCapture = () => {};

function pointer(clientX: number): PointerEvent {
	return { currentTarget: row, clientX, pointerId: 1 } as never;
}

test("the drag preview stays until the sheet's open morph has finished", async () => {
	const finish = holdTransitions();
	const drag = createRoot(() =>
		createNewRangeDrag({
			timeline: () =>
				({ dayWidth: DAY_WIDTH, rangeStartMs: 0 }) as Timeline,
			// The sheet opens out of the preview: its morph starts here.
			onCreateRange: () => {
				void viewTransition(() => {});
			},
		})
	);
	drag.newPointerDown(pointer(0));
	drag.newPointerMove(pointer(3 * DAY_WIDTH));
	drag.newPointerUp(pointer(3 * DAY_WIDTH));
	expect(drag.newRange()).toEqual({ a: 0, b: 3 });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(drag.newRange()).toEqual({ a: 0, b: 3 });
	finish();
	await vi.waitFor(() => {
		expect(drag.newRange()).toBeNull();
	});
});

test("a new drag started while the preview is held is not cleared by the old morph", async () => {
	const finish = holdTransitions();
	const drag = createRoot(() =>
		createNewRangeDrag({
			timeline: () =>
				({ dayWidth: DAY_WIDTH, rangeStartMs: 0 }) as Timeline,
			onCreateRange: () => {
				void viewTransition(() => {});
			},
		})
	);
	drag.newPointerDown(pointer(0));
	drag.newPointerUp(pointer(2 * DAY_WIDTH));
	drag.newPointerDown(pointer(5 * DAY_WIDTH));
	finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(drag.newRange()).toEqual({ a: 5, b: 5 });
});
