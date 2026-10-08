import { render, screen, fireEvent } from "@solidjs/testing-library";

import { Tooltip } from "./Tooltip.tsx";

test("shows content on hover", async () => {
	render(() => (
		<Tooltip tooltipContent="hi">
			<button>t</button>
		</Tooltip>
	));
	fireEvent.pointerMove(screen.getByText("t"));
	expect(await screen.findByText("hi")).toBeInTheDocument();
});

/**
 * The positioner is portalled to `<body>`. Positioned absolutely it belongs to
 * the document's scrollable overflow, and its first, unmeasured placement sits
 * past the right edge of a phone viewport — which widened the page and made
 * Chrome for Android load a deep-linked drawer zoomed out, in desktop layout.
 * Fixed keeps it out of the document's overflow entirely.
 */
test("positions the tooltip against the viewport, not the document", async () => {
	render(() => (
		<Tooltip tooltipContent="hi">
			<button>t</button>
		</Tooltip>
	));
	fireEvent.pointerMove(screen.getByText("t"));
	await screen.findByText("hi");
	const positioner = document.querySelector(
		'[data-scope="tooltip"][data-part="positioner"]'
	);
	expect(positioner).not.toBeNull();
	expect((positioner as HTMLElement).style.position).toBe("fixed");
});

test("a caller's own positioning still wins", async () => {
	render(() => (
		<Tooltip tooltipContent="hi" positioning={{ strategy: "absolute" }}>
			<button>t</button>
		</Tooltip>
	));
	fireEvent.pointerMove(screen.getByText("t"));
	await screen.findByText("hi");
	const positioner = document.querySelector(
		'[data-scope="tooltip"][data-part="positioner"]'
	);
	expect((positioner as HTMLElement).style.position).toBe("absolute");
});

test("closed tooltip content is not in the DOM", () => {
	render(() => <Tooltip tooltipContent="Hint">trigger</Tooltip>);
	expect(screen.queryByText("Hint")).toBeNull();
});
