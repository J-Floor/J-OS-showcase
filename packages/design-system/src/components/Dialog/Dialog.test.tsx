import { readFileSync } from "node:fs";

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createEffect, createSignal } from "solid-js";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";

import {
	fakeViewTransitions,
	installViewTransitions,
	mockLayoutBoxes,
	namedIds,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { MORPH_SCRIM, MORPH_TITLE } from "../../utils/morphNames.ts";
import { SWIPE_MIN_DISTANCE } from "../../utils/swipe.ts";

import { Dialog } from "./Dialog.tsx";

afterEach(cleanup);

/*
 * NOT TESTED HERE: that an opening dialog focuses itself rather than the close
 * button inside it (see `Root` in Dialog.tsx).
 *
 * It cannot be. The focus trap picks the first TABBABLE descendant, and
 * `tabbable` treats a zero-size element as untabbable. jsdom performs no
 * layout, so every element measures 0×0, no descendant qualifies, and the trap
 * falls back to focusing the content — which is the very outcome the fix
 * produces. The assertion passes with the fix reverted, so it would pin
 * nothing. Verified in Chrome instead, by measuring the tooltip's recorded
 * reference box before and after.
 */

test("Header carries a close button with an accessible name", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Change role</Dialog.Title>
				</Dialog.Header>
			</Dialog.Content>
		</Dialog.Root>
	));
	// The name comes from the IconButton's tooltip label; an icon-only button
	// that loses it reaches a screen reader as "button".
	const close = screen.getByRole("button", { name: "Close" });
	expect(close.closest("header")).not.toBeNull();
});

test("a dialog without a Header has no close button", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Search</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

test("renders the title and content the caller passed", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Change role</Dialog.Title>
					<Dialog.Description>Pick a destination.</Dialog.Description>
				</Dialog.Header>
			</Dialog.Content>
		</Dialog.Root>
	));
	// The dialog is named by its title — the whole reason `Root` focuses the
	// content rather than the close button.
	const dialog = screen.getByRole("dialog");
	expect(dialog).toHaveAccessibleName("Change role");
	expect(screen.getByText("Pick a destination.")).toBeInTheDocument();
});

test("each part builds its children once", () => {
	let built = 0;
	function Probe() {
		built += 1;
		return <span>probe</span>;
	}
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>
						<Probe />
					</Dialog.Title>
					<Dialog.Description>
						<Probe />
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body>
					<Probe />
				</Dialog.Body>
				<Dialog.Footer>
					<Probe />
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(built).toBe(4);
	expect(screen.getAllByText("probe")).toHaveLength(4);
});

test("Header, Body and Footer lay the card out in that order", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Confirm</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<p>Details</p>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Cancel />
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	));
	const header = screen.getByText("Confirm").closest("header");
	const footer = screen
		.getByRole("button", { name: "Cancel" })
		.closest("footer");
	const body = screen.getByText("Details").parentElement;
	expect(header).not.toBeNull();
	expect(footer).not.toBeNull();
	expect(body?.previousElementSibling).toBe(header);
	expect(body?.nextElementSibling).toBe(footer);
});

test("onOpenChange hears the open state as a plain boolean", async () => {
	const onOpenChange = vi.fn();
	render(() => (
		<Dialog.Root open onOpenChange={onOpenChange}>
			<Dialog.Content>
				<Dialog.Title>Confirm</Dialog.Title>
				<Dialog.Footer>
					<Dialog.Cancel />
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	));
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveAttribute(
			"data-state",
			"open"
		);
	});
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("morphId={false} still opens and closes", async () => {
	const [open, setOpen] = createSignal(false);
	render(() => (
		<Dialog.Root open={open()} morphId={false}>
			<Dialog.Content>
				<Dialog.Title>Plain</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	setOpen(true);
	expect(await screen.findByRole("dialog")).toHaveAttribute(
		"data-state",
		"open"
	);
	setOpen(false);
	await waitFor(() => {
		expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
			"data-state",
			"closed"
		);
	});
});

test("given an entity, closes into the on-screen element showing it", async () => {
	const names: string[] = [];
	mockLayoutBoxes();
	fakeViewTransitions({
		sync: true,
		onSnapshot: () => names.push(...namedIds("[data-morph-of]")),
	});
	onTestFinished(restoreViewTransitions);
	const [open, setOpen] = createSignal(true);
	render(() => (
		<>
			<div id="row" data-morph-of="t1" />
			<Dialog.Root open={open()} morphId={"t1"}>
				<Dialog.Content>
					<Dialog.Title>Task</Dialog.Title>
				</Dialog.Content>
			</Dialog.Root>
		</>
	));
	setOpen(false);
	await waitFor(() => {
		expect(names).toEqual(["row"]);
	});
});

test("Cancel is a tertiary close trigger labelled Cancel by default", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Confirm</Dialog.Title>
				<Dialog.Cancel />
			</Dialog.Content>
		</Dialog.Root>
	));
	const cancel = screen.getByRole("button", { name: "Cancel" });
	expect(cancel).toHaveAttribute("data-variant", "tertiary");
	expect(cancel).toHaveAttribute("data-part", "close-trigger");
});

test("Cancel takes its own label and hands its element to a ref", () => {
	let element: HTMLElement | undefined;
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Confirm</Dialog.Title>
				<Dialog.Cancel
					ref={(button) => {
						element = button;
					}}
				>
					Keep it
				</Dialog.Cancel>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(element).toBe(screen.getByRole("button", { name: "Keep it" }));
});

/** A caller that asks for the dialog in its own mount effect: `open` is
 *  false while Dialog.Root renders, true before the first flush ends. */
function OpensOnMount() {
	const [open, setOpen] = createSignal(false);
	createEffect(() => {
		setOpen(true);
	});
	return (
		<Dialog.Root open={open()}>
			<Dialog.Content>
				<Dialog.Title>Welcome</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	);
}

test("a dialog asked open in its caller's mount effect opens", async () => {
	render(() => <OpensOnMount />);
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveAttribute(
			"data-state",
			"open"
		);
	});
});

test("a dialog asked open in its caller's mount effect opens through a morph", async () => {
	fakeViewTransitions();
	onTestFinished(restoreViewTransitions);
	render(() => <OpensOnMount />);
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveAttribute(
			"data-state",
			"open"
		);
	});
});

test("its scrim is marked to fade with the morph", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Confirm</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(
		document.querySelector('[data-scope="dialog"][data-part="backdrop"]')
	).toHaveAttribute(MORPH_SCRIM);
});

test("its scrim runs no fade of its own while a morph fades it", () => {
	const styles = readFileSync(
		`${import.meta.dirname}/Dialog.module.scss`,
		"utf8"
	);
	const start = styles.indexOf(".backdrop {");
	const backdrop = styles.slice(start, styles.indexOf("\n}\n", start));
	expect(backdrop).toMatch(
		/:root\[data-vt~="morph"\] & \{\s*transition: none;\s*\}/
	);
});

test("its title is the morph title", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Confirm</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(screen.getByText("Confirm")).toHaveAttribute(MORPH_TITLE, "");
});

/** View Transitions whose animation runs until `finish` is called. */
function heldTransitions(): { finish: () => void } {
	const pending: (() => void)[] = [];
	installViewTransitions((update: () => unknown) => {
		const finished = new Promise<void>((resolve) => {
			pending.push(resolve);
		});
		const updated = Promise.resolve(update());
		return { finished, updateCallbackDone: updated };
	});
	function finish(): void {
		for (const resolve of pending.splice(0)) resolve();
	}
	// None outlives its test: a later test's close would wait on it.
	onTestFinished(async () => {
		finish();
		await transitionSettled();
		restoreViewTransitions();
	});
	return { finish };
}

function ContentHarness(props: { onBuild: () => void }) {
	const [open, setOpen] = createSignal(false);
	function Probe() {
		props.onBuild();
		return <span>body</span>;
	}
	return (
		<>
			<button
				onClick={() => {
					setOpen((isOpen) => !isOpen);
				}}
			>
				toggle
			</button>
			<Dialog.Root open={open()}>
				<Dialog.Content>
					<Dialog.Title>With content</Dialog.Title>
					<Probe />
				</Dialog.Content>
			</Dialog.Root>
		</>
	);
}

function toggleButton(): HTMLElement {
	return screen.getByRole("button", { name: "toggle", hidden: true });
}

test("Content builds on open, outlives the close morph, and builds afresh on the next open", async () => {
	const transitions = heldTransitions();
	const build = vi.fn();
	render(() => <ContentHarness onBuild={build} />);
	expect(screen.queryByText("body")).toBeNull();
	fireEvent.click(toggleButton());
	// The open's update has run, so the close is a transition of its own.
	await transitionSettled();
	expect(screen.getByText("body")).toBeInTheDocument();
	transitions.finish();
	fireEvent.click(toggleButton());
	await transitionSettled();
	expect(screen.getByRole("dialog", { hidden: true })).toHaveAttribute(
		"data-state",
		"closed"
	);
	// The close morph is still running: the body is in it.
	expect(screen.getByText("body")).toBeInTheDocument();
	transitions.finish();
	await waitFor(() => {
		expect(screen.queryByText("body")).toBeNull();
	});
	fireEvent.click(toggleButton());
	await waitFor(() => {
		expect(screen.getByText("body")).toBeInTheDocument();
	});
	expect(build).toHaveBeenCalledTimes(2);
});

test("without View Transitions, Content stays until the card's own exit has finished", async () => {
	let exit!: () => void;
	const finished = new Promise<void>((resolve) => {
		exit = resolve;
	});
	render(() => <ContentHarness onBuild={() => {}} />);
	fireEvent.click(toggleButton());
	await waitFor(() => {
		expect(screen.getByText("body")).toBeInTheDocument();
	});
	// jsdom runs no CSS: the card's pop-out stands in as one animation.
	Object.assign(screen.getByRole("dialog", { hidden: true }), {
		getAnimations: () => [{ finished }],
	});
	fireEvent.click(toggleButton());
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.getByText("body")).toBeInTheDocument();
	exit();
	await waitFor(() => {
		expect(screen.queryByText("body")).toBeNull();
	});
});

test("Content reopened while its close morph still runs builds afresh", async () => {
	const transitions = heldTransitions();
	const build = vi.fn();
	render(() => <ContentHarness onBuild={build} />);
	fireEvent.click(toggleButton());
	await transitionSettled();
	transitions.finish();
	fireEvent.click(toggleButton());
	// The close's update has run; its animation has not finished.
	await transitionSettled();
	expect(screen.getByText("body")).toBeInTheDocument();
	fireEvent.click(toggleButton());
	await transitionSettled();
	expect(screen.getByText("body")).toBeInTheDocument();
	expect(build).toHaveBeenCalledTimes(2);
	transitions.finish();
});

function renderPlaced(placement?: "bottom") {
	const onOpenChange = vi.fn();
	render(() => (
		<Dialog.Root open onOpenChange={onOpenChange}>
			<Dialog.Content placement={placement}>
				<Dialog.Title>Placed</Dialog.Title>
				<p>card body</p>
			</Dialog.Content>
		</Dialog.Root>
	));
	return { onOpenChange };
}

function touch(
	type: "pointerdown" | "pointerup",
	target: Element,
	clientY: number
): void {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			pointerId: 1,
			pointerType: "touch",
			isPrimary: true,
			clientX: 100,
			clientY,
		})
	);
}

function dragDown(target: Element, distance: number): void {
	touch("pointerdown", target, 100);
	touch("pointerup", target, 100 + distance);
}

test("the card is centred by default", () => {
	renderPlaced();
	expect(screen.getByRole("dialog")).toHaveAttribute(
		"data-placement",
		"center"
	);
});

test("placement bottom marks the card and its positioner for the stylesheet", () => {
	renderPlaced("bottom");
	const dialog = screen.getByRole("dialog");
	expect(dialog).toHaveAttribute("data-placement", "bottom");
	expect(dialog.parentElement).toHaveAttribute("data-placement", "bottom");
});

test("a bottom card closes on a swipe down", async () => {
	const { onOpenChange } = renderPlaced("bottom");
	dragDown(screen.getByText("card body"), SWIPE_MIN_DISTANCE);
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("a bottom card stays open on a short drag or a swipe up", () => {
	const { onOpenChange } = renderPlaced("bottom");
	dragDown(screen.getByText("card body"), SWIPE_MIN_DISTANCE - 1);
	dragDown(screen.getByText("card body"), -SWIPE_MIN_DISTANCE);
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a centred card does not close on a swipe down", () => {
	const { onOpenChange } = renderPlaced();
	dragDown(screen.getByText("card body"), SWIPE_MIN_DISTANCE * 2);
	expect(onOpenChange).not.toHaveBeenCalled();
});

/** A body taller than its box, as the browser would lay it out. */
function scrollingBody(body: HTMLElement): void {
	body.style.setProperty("overflow-block", "auto");
	body.style.setProperty("overflow-y", "auto");
	Object.defineProperty(body, "scrollHeight", { value: 400 });
	Object.defineProperty(body, "clientHeight", { value: 100 });
}

function renderLongBottom() {
	const onOpenChange = vi.fn();
	render(() => (
		<Dialog.Root open onOpenChange={onOpenChange}>
			<Dialog.Content placement="bottom">
				<Dialog.Header>
					<Dialog.Title>Long</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<p>long text</p>
				</Dialog.Body>
			</Dialog.Content>
		</Dialog.Root>
	));
	scrollingBody(screen.getByText("long text").parentElement!);
	return { onOpenChange };
}

test("a swipe down that starts in a scrolling body scrolls it and leaves the dialog open", () => {
	const { onOpenChange } = renderLongBottom();
	dragDown(screen.getByText("long text"), SWIPE_MIN_DISTANCE * 2);
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("a swipe down that starts outside the scrolling body closes the dialog", async () => {
	const { onOpenChange } = renderLongBottom();
	dragDown(screen.getByText("Long"), SWIPE_MIN_DISTANCE);
	await waitFor(() => {
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

test("flush marks the card to drop its padding", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content flush>
				<Dialog.Title>Flush</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	expect(screen.getByRole("dialog")).toHaveAttribute("data-flush");
});

test("a card is padded unless it asks to be flush", () => {
	renderPlaced();
	expect(screen.getByRole("dialog")).not.toHaveAttribute("data-flush");
});
