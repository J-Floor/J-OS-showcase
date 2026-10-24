import { render, screen, fireEvent } from "@solidjs/testing-library";

import { IconButton } from "../IconButton/IconButton.tsx";

import {
	LONG_PRESS_CLOSE_DELAY_MS,
	LONG_PRESS_MS,
	LONG_PRESS_SLOP_PX,
} from "./longPress.ts";
import { TOOLTIP_OPEN_DELAY_MS, Tooltip } from "./Tooltip.tsx";

/** Hover the trigger and wait out the open delay on the fake clock. */
async function hoverOpen(trigger: HTMLElement): Promise<void> {
	fireEvent.pointerMove(trigger);
	await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS);
}

describe("hover", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("opens once the hover delay has passed", async () => {
		render(() => (
			<Tooltip tooltipContent="hi">
				<button>t</button>
			</Tooltip>
		));
		fireEvent.pointerMove(screen.getByText("t"));
		await vi.advanceTimersByTimeAsync(TOOLTIP_OPEN_DELAY_MS - 1);
		expect(screen.queryByText("hi")).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(screen.getByText("hi")).toBeInTheDocument();
	});

	/**
	 * The positioner is portalled to `<body>`. Positioned absolutely it belongs
	 * to the document's scrollable overflow, and its first, unmeasured placement
	 * sits past the right edge of a phone viewport, which widens the page.
	 * Fixed keeps it out of the document's overflow entirely.
	 */
	test("positions the tooltip against the viewport, not the document", async () => {
		render(() => (
			<Tooltip tooltipContent="hi">
				<button>t</button>
			</Tooltip>
		));
		await hoverOpen(screen.getByText("t"));
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
		await hoverOpen(screen.getByText("t"));
		const positioner = document.querySelector(
			'[data-scope="tooltip"][data-part="positioner"]'
		);
		expect((positioner as HTMLElement).style.position).toBe("absolute");
	});

	describe("Tooltip.Anchor", () => {
		test("its child becomes the trigger and shows the label on hover", async () => {
			render(() => (
				<Tooltip.Anchor label="Clear">
					<button type="button">x</button>
				</Tooltip.Anchor>
			));
			await hoverOpen(screen.getByText("x"));
			expect(screen.getByRole("tooltip")).toHaveTextContent("Clear");
		});

		test("focusing the child opens the label", async () => {
			render(() => (
				<Tooltip.Anchor label="Clear">
					<button type="button">x</button>
				</Tooltip.Anchor>
			));
			// Tooltips open on keyboard focus only: tab in, as a keyboard user does.
			fireEvent.keyDown(document, { key: "Tab" });
			screen.getByText("x").focus();
			await vi.advanceTimersByTimeAsync(0);
			expect(screen.getByRole("tooltip")).toHaveTextContent("Clear");
		});

		test("triggerTabIndex lands on the anchor, so focusing it opens the label", async () => {
			render(() => (
				<Tooltip.Anchor label="Clear" triggerTabIndex={0}>
					<button type="button" disabled>
						x
					</button>
				</Tooltip.Anchor>
			));
			const anchor = screen.getByText("x").parentElement!;
			expect(anchor).toHaveAttribute("tabindex", "0");
			fireEvent.keyDown(document, { key: "Tab" });
			anchor.focus();
			await vi.advanceTimersByTimeAsync(0);
			expect(screen.getByRole("tooltip")).toHaveTextContent("Clear");
		});

		test("the anchor span is the trigger and the child keeps its own id", () => {
			render(() => (
				<Tooltip.Anchor label="Clear" class="custom">
					<button type="button" id="own">
						x
					</button>
				</Tooltip.Anchor>
			));
			const child = screen.getByText("x");
			expect(child.id).toBe("own");
			const anchor = child.parentElement!;
			expect(anchor).toHaveAttribute("data-part", "trigger");
			expect(anchor).toHaveClass("custom");
		});

		test("disabled keeps it closed", async () => {
			render(() => (
				<Tooltip.Anchor label="Clear" disabled>
					<button type="button">x</button>
				</Tooltip.Anchor>
			));
			await hoverOpen(screen.getByText("x"));
			expect(screen.queryByText("Clear")).toBeNull();
		});

		test("the child keeps its own click", () => {
			const onClick = vi.fn();
			render(() => (
				<Tooltip.Anchor label="Clear">
					<button type="button" onClick={onClick}>
						x
					</button>
				</Tooltip.Anchor>
			));
			fireEvent.click(screen.getByText("x"));
			expect(onClick).toHaveBeenCalledTimes(1);
		});
	});
});

test("closed tooltip content is not in the DOM", () => {
	render(() => <Tooltip tooltipContent="Hint">trigger</Tooltip>);
	expect(screen.queryByText("Hint")).toBeNull();
});

function setup(onClick = vi.fn()) {
	render(() => (
		<Tooltip tooltipContent="hint">
			<button onClick={onClick}>t</button>
		</Tooltip>
	));
	return { trigger: screen.getByText("t"), onClick };
}

describe("long press on touch", () => {
	const touch = {
		pointerType: "touch",
		pointerId: 1,
		clientX: 5,
		clientY: 5,
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	test("holding opens the tooltip", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS - 1);
		expect(screen.queryByText("hint")).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(screen.getByText("hint")).toBeInTheDocument();
	});

	test("releasing closes it after a short delay", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		fireEvent.pointerUp(trigger, touch);
		expect(screen.getByText("hint")).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(LONG_PRESS_CLOSE_DELAY_MS + 400);
		expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
	});

	test("a quick tap neither opens nor loses its click", async () => {
		const { trigger, onClick } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(100);
		fireEvent.pointerUp(trigger, touch);
		fireEvent.click(trigger);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
		expect(screen.queryByText("hint")).toBeNull();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("the click after a long press is swallowed, the next tap is not", async () => {
		const { trigger, onClick } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		fireEvent.pointerUp(trigger, touch);
		fireEvent.click(trigger);
		expect(onClick).not.toHaveBeenCalled();
		fireEvent.pointerDown(trigger, touch);
		fireEvent.pointerUp(trigger, touch);
		fireEvent.click(trigger);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("the context menu is blocked during a long press only", async () => {
		const { trigger } = setup();
		expect(fireEvent.contextMenu(trigger)).toBe(true);
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		expect(fireEvent.contextMenu(trigger)).toBe(false);
	});

	test("a touch press blocks the context menu before the tooltip opens", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(300);
		expect(fireEvent.contextMenu(trigger)).toBe(false);
		fireEvent.pointerUp(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_CLOSE_DELAY_MS);
		expect(fireEvent.contextMenu(trigger)).toBe(true);
	});

	test("a mouse right-click keeps the native context menu", () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, { ...touch, pointerType: "mouse" });
		expect(fireEvent.contextMenu(trigger)).toBe(true);
	});

	test("the tooltip survives the pointerleave a touch release fires", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		fireEvent.pointerUp(trigger, touch);
		fireEvent.pointerLeave(trigger.parentElement!, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_CLOSE_DELAY_MS - 100);
		expect(screen.getByRole("tooltip")).toBeVisible();
		await vi.advanceTimersByTimeAsync(100 + 400);
		expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
	});

	test("a mouse hover-out still closes immediately", async () => {
		const { trigger } = setup();
		const mouse = { ...touch, pointerType: "mouse" };
		fireEvent.pointerMove(trigger, mouse);
		await vi.advanceTimersByTimeAsync(300);
		expect(screen.getByText("hint")).toBeInTheDocument();
		fireEvent.pointerLeave(trigger.parentElement!, mouse);
		await vi.advanceTimersByTimeAsync(400);
		expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
	});

	test("an unclaimed swallow flag expires", async () => {
		const { trigger, onClick } = setup();
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		fireEvent.pointerUp(trigger, touch);
		await vi.advanceTimersByTimeAsync(1000);
		fireEvent.click(trigger);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("a mouse click after a touch long press is not eaten", async () => {
		const { trigger, onClick } = setup();
		const mouse = { ...touch, pointerType: "mouse" };
		fireEvent.pointerDown(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		fireEvent.pointerUp(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_CLOSE_DELAY_MS + 400);
		fireEvent.pointerDown(trigger, mouse);
		fireEvent.pointerUp(trigger, mouse);
		fireEvent.click(trigger);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("moving past the slop cancels", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		fireEvent.pointerMove(trigger, {
			...touch,
			clientX: 5 + LONG_PRESS_SLOP_PX + 1,
		});
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
		expect(screen.queryByText("hint")).toBeNull();
	});

	test("moving within the slop does not cancel", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		fireEvent.pointerMove(trigger, { ...touch, clientX: 8 });
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		expect(screen.getByText("hint")).toBeInTheDocument();
	});

	test("a pointercancel (scroll) cancels", async () => {
		const { trigger } = setup();
		fireEvent.pointerDown(trigger, touch);
		fireEvent.pointerCancel(trigger, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
		expect(screen.queryByText("hint")).toBeNull();
	});

	test("a mouse never takes the long-press path", async () => {
		const { trigger, onClick } = setup();
		const mouse = { ...touch, pointerType: "mouse" };
		fireEvent.pointerDown(trigger, mouse);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS * 2);
		expect(screen.queryByText("hint")).toBeNull();
		fireEvent.pointerUp(trigger, mouse);
		fireEvent.click(trigger);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	test("an IconButton keeps its tap, and a long press does not fire it", async () => {
		const onClick = vi.fn();
		render(() => (
			<IconButton tooltipLabel="Delete" onClick={onClick}>
				delete
			</IconButton>
		));
		const button = screen.getByRole("button", { name: "Delete" });
		fireEvent.pointerDown(button, touch);
		fireEvent.pointerUp(button, touch);
		fireEvent.click(button);
		expect(onClick).toHaveBeenCalledTimes(1);

		fireEvent.pointerDown(button, touch);
		await vi.advanceTimersByTimeAsync(LONG_PRESS_MS);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();
		fireEvent.pointerUp(button, touch);
		fireEvent.click(button);
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
