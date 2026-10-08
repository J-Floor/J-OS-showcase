// @vitest-environment jsdom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

if (!("visualViewport" in globalThis)) {
	Object.defineProperty(globalThis, "visualViewport", {
		value: {
			width: 1024,
			height: 768,
			offsetLeft: 0,
			offsetTop: 0,
			pageLeft: 0,
			pageTop: 0,
			scale: 1,
			addEventListener: () => {},
			removeEventListener: () => {},
		},
		writable: true,
	});
}

import { Tour, useTour, type TourStep } from "../../index.ts";

const steps: TourStep[] = [
	{
		id: "welcome",
		type: "dialog",
		title: "Hello there",
		description: "A tour.",
		actions: [{ label: "Start", action: "next" }],
	},
];

test("renders the active step's title once started", async () => {
	function Harness() {
		const tour = useTour({ steps });
		tour().start();
		return <Tour tour={tour} />;
	}
	render(() => <Harness />);
	expect(await screen.findByText("Hello there")).toBeInTheDocument();
});

test("renders nothing at all while the tour has not started", () => {
	function Harness() {
		const tour = useTour({ steps });
		return <Tour tour={tour} />;
	}
	const { baseElement } = render(() => <Harness />);
	// Ark keeps its positioner and content mounted when closed, with no
	// `hidden` and no `display: none`, so an unstarted tour used to leave an
	// empty card in the document — parked past the fold on desktop, reachable
	// on a phone, and announced the whole time as an open modal alertdialog.
	expect(baseElement.querySelectorAll('[data-scope="tour"]')).toHaveLength(0);
	expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
