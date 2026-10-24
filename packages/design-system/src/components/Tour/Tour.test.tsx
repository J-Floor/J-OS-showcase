// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
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

import { type UseTourReturn } from "./Tour.tsx";

const steps: TourStep[] = [
	{
		id: "welcome",
		type: "dialog",
		title: "Hello there",
		description: "A tour.",
		actions: [{ label: "Start", action: "next" }],
	},
];

function StartedTourHarness() {
	const tour = useTour({ steps });
	tour().start();
	return <Tour tour={tour} />;
}

function IdleTourHarness() {
	const tour = useTour({ steps });
	return <Tour tour={tour} />;
}

test("an action button is named by its visible label, not by its action", async () => {
	render(() => <StartedTourHarness />);
	expect(
		await screen.findByRole("button", { name: "Start" })
	).toBeInTheDocument();
});

test("focus goes back to where it was once the tour ends", async () => {
	let tour: UseTourReturn | undefined;
	function Harness() {
		const handle = useTour({ steps });
		tour = handle;
		return (
			<>
				<button type="button">Before</button>
				<Tour tour={handle} />
			</>
		);
	}
	render(() => <Harness />);
	const before = screen.getByRole("button", { name: "Before" });
	before.focus();
	tour?.().start();
	const start = await screen.findByRole("button", { name: "Start" });
	start.focus();
	const close = document.querySelector<HTMLElement>(
		'[data-scope="tour"][data-part="close-trigger"]'
	);
	close?.focus();
	fireEvent.click(close!);
	await waitFor(() => {
		expect(screen.queryByText("Hello there")).toBeNull();
	});
	await waitFor(() => {
		expect(document.activeElement).toBe(before);
	});
});

function OverriddenTourHarness() {
	const tour = useTour({ steps });
	tour().start();
	return (
		<Tour
			tour={tour}
			classOverride={{
				backdropClass: "my-backdrop",
				spotlightClass: "my-spotlight",
				positionerClass: "my-positioner",
				contentClass: "my-content",
			}}
		/>
	);
}

test("classOverride restyles each part", async () => {
	render(() => <OverriddenTourHarness />);
	await screen.findByText("Hello there");
	for (const [part, name] of [
		["backdrop", "my-backdrop"],
		["spotlight", "my-spotlight"],
		["positioner", "my-positioner"],
		["content", "my-content"],
	]) {
		expect(
			document.querySelector(`[data-scope="tour"][data-part="${part}"]`)
		).toHaveClass(name);
	}
});

test("renders the active step's title once started", async () => {
	render(() => <StartedTourHarness />);
	expect(await screen.findByText("Hello there")).toBeInTheDocument();
});

test("renders nothing at all while the tour has not started", () => {
	const { baseElement } = render(() => <IdleTourHarness />);
	// Ark keeps its positioner and content mounted when closed, with no
	// `hidden` and no `display: none`, so an unstarted tour used to leave an
	// empty card in the document — parked past the fold on desktop, reachable
	// on a phone, and announced the whole time as an open modal alertdialog.
	expect(baseElement.querySelectorAll('[data-scope="tour"]')).toHaveLength(0);
	expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
