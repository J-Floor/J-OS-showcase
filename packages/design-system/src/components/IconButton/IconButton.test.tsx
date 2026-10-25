import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import type { Hotkey } from "@tanstack/solid-hotkeys";
import { createSignal } from "solid-js";
import { afterEach, onTestFinished, vi } from "vitest";

import { nearestVisibleAnchor } from "../../utils/visibleArea.ts";
import { Menu } from "../Menu/Menu.tsx";

import { IconButton } from "./IconButton.tsx";

afterEach(() => {
	vi.restoreAllMocks();
});

test("renders icon ligature, exposes accessible name via tooltip label", () => {
	render(() => <IconButton tooltipLabel="Add">add</IconButton>);
	expect(screen.getByText("add")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
});

test("does not nest interactive elements (no <button><button>)", () => {
	const { container } = render(() => (
		<IconButton tooltipLabel="Add">add</IconButton>
	));
	expect(container.querySelectorAll("button button")).toHaveLength(0);
	expect(container.querySelectorAll("button")).toHaveLength(1);
});

test("renders a spinner instead of the icon while loading", () => {
	render(() => (
		<IconButton tooltipLabel="Add" isLoading>
			add
		</IconButton>
	));
	expect(screen.getByRole("status")).toBeInTheDocument();
	expect(screen.queryByText("add")).not.toBeInTheDocument();
});

test("a caller's aria-label is kept", () => {
	render(() => (
		<IconButton tooltipLabel="Remove" aria-label="Remove the filter">
			close
		</IconButton>
	));
	expect(
		screen.getByRole("button", { name: "Remove the filter" })
	).toBeInTheDocument();
});

test("a caller's aria-labelledby names the button instead of the label", () => {
	render(() => (
		<>
			<span id="remove-name">Remove the filter</span>
			<IconButton tooltipLabel="Remove" aria-labelledby="remove-name">
				close
			</IconButton>
		</>
	));
	const button = screen.getByRole("button", { name: "Remove the filter" });
	expect(button).not.toHaveAttribute("aria-label");
});

test("a caller's aria-describedby is kept while the tooltip is closed", () => {
	render(() => (
		<>
			<span id="remove-hint">Removes it for everyone</span>
			<IconButton tooltipLabel="Remove" aria-describedby="remove-hint">
				close
			</IconButton>
		</>
	));
	expect(screen.getByRole("button", { name: "Remove" })).toHaveAttribute(
		"aria-describedby",
		"remove-hint"
	);
});

test("an open tooltip joins a caller's aria-describedby instead of replacing it", async () => {
	render(() => (
		<>
			<span id="remove-hint">Removes it for everyone</span>
			<IconButton tooltipLabel="Remove" aria-describedby="remove-hint">
				close
			</IconButton>
		</>
	));
	const button = screen.getByRole("button", { name: "Remove" });
	fireEvent.keyDown(document, { key: "Tab" });
	button.focus();
	const tooltip = await screen.findByRole("tooltip", { hidden: true });
	await waitFor(() => {
		expect(button).toHaveAttribute(
			"aria-describedby",
			`remove-hint ${tooltip.id}`
		);
	});
});

test("an async onClick shows the spinner until it settles", async () => {
	let settle!: () => void;
	render(() => (
		<IconButton
			tooltipLabel="Save"
			onClick={() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				})
			}
		>
			save
		</IconButton>
	));
	const button = screen.getByRole("button", { name: "Save" });
	fireEvent.click(button);
	expect(button.querySelector("[role='status']")).not.toBeNull();
	expect(screen.queryByText("save")).not.toBeInTheDocument();

	settle();
	await waitFor(() => {
		expect(screen.getByText("save")).toBeInTheDocument();
	});
	expect(button.querySelector("[role='status']")).toBeNull();
});

test("fires onClick", () => {
	let isClicked = false;
	render(() => (
		<IconButton
			tooltipLabel="Add"
			onClick={() => {
				isClicked = true;
			}}
		>
			add
		</IconButton>
	));
	screen.getByRole("button", { name: "Add" }).click();
	expect(isClicked).toBe(true);
});

test("when disabled, renders bare without a tooltip trigger and is non-interactive", () => {
	let isClicked = false;
	render(() => (
		<IconButton
			tooltipLabel="Add"
			disabled
			shamefullyOmitDisabledReason
			onClick={() => {
				isClicked = true;
			}}
		>
			add
		</IconButton>
	));
	const button = screen.getByRole("button", { name: "Add" });
	button.click();
	expect(isClicked).toBe(false);
	expect(button).toBeDisabled();
});

test("the tooltip carries the shortcut chip, the accessible name does not", async () => {
	render(() => (
		<IconButton tooltipLabel="Turn down" shortcut="D">
			close
		</IconButton>
	));
	const button = screen.getByRole("button", { name: "Turn down" });
	expect(button).toBeInTheDocument();
	fireEvent.pointerMove(button);
	const chip = await screen.findByRole("group", { name: "D" });
	expect(chip).toBeInTheDocument();
});

test("without a shortcut the tooltip is just the label", async () => {
	render(() => <IconButton tooltipLabel="Turn down">close</IconButton>);
	fireEvent.pointerMove(screen.getByRole("button", { name: "Turn down" }));
	expect(await screen.findByText("Turn down")).toBeInTheDocument();
	// A stray chip commits a tick after its sibling text node, so the FIRST
	// mutation the DOM observer above sees can predate it — pin the tooltip's
	// full text once settled before trusting the group query below is final.
	await waitFor(() => {
		expect(screen.getByRole("tooltip")).toHaveTextContent(/^Turn down$/);
	});
	expect(screen.queryByRole("group")).toBeNull();
});

/**
 * The reason the `Show` around the chip is `keyed`.
 *
 * `<Show when={x}>{(v) => …}` runs its callback ONCE, when the condition first
 * turns truthy, and does not re-run as one truthy value becomes another. A
 * shortcut changing from one key to another is exactly that transition, so
 * without `keyed` the chip would freeze on whichever key it first rendered —
 * silently, and only for a button whose shortcut is reactive.
 */
test("the chip follows a shortcut that changes", async () => {
	const [shortcut, setShortcut] = createSignal<Hotkey>("D");
	render(() => (
		<IconButton tooltipLabel="Decide" shortcut={shortcut()}>
			close
		</IconButton>
	));
	fireEvent.pointerMove(screen.getByRole("button", { name: "Decide" }));
	expect(await screen.findByRole("group", { name: "D" })).toBeInTheDocument();
	setShortcut("G");
	await waitFor(() => {
		expect(screen.getByRole("group", { name: "G" })).toBeInTheDocument();
	});
	expect(screen.queryByRole("group", { name: "D" })).toBeNull();
});

test("a shortcut names its key on the button, following a change", () => {
	const [shortcut, setShortcut] = createSignal<Hotkey>("D");
	render(() => (
		<IconButton tooltipLabel="Decide" shortcut={shortcut()}>
			close
		</IconButton>
	));
	const button = screen.getByRole("button", { name: "Decide" });
	expect(button).toHaveAttribute("aria-keyshortcuts", "D");
	setShortcut("Shift+G");
	expect(button).toHaveAttribute("aria-keyshortcuts", "Shift+G");
});

test("a lone modifier hint fires nothing, so names no key", () => {
	render(() => (
		<IconButton tooltipLabel="Peek" shortcut="Alt">
			keyboard
		</IconButton>
	));
	expect(screen.getByRole("button")).not.toHaveAttribute("aria-keyshortcuts");
});

test("with triggerProps the shortcut sits on the button, not the tooltip's span", () => {
	render(() => (
		<IconButton tooltipLabel="Open" shortcut="O" triggerProps={{}}>
			add
		</IconButton>
	));
	const button = screen.getByRole("button", { name: "Open" });
	expect(button).toHaveAttribute("aria-keyshortcuts", "O");
	expect(document.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(1);
});

test("as a menu trigger it keeps the menu's id and state while its tooltip still opens", async () => {
	render(() => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						triggerProps={triggerProps()}
					>
						more_vert
					</IconButton>
				)}
			/>
			<Menu.Content>
				<Menu.Item value="a">A</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	));
	const button = screen.getByRole("button", { name: "More" });
	expect(button.id).toMatch(/^menu:/);
	expect(button).toHaveAttribute("aria-haspopup", "menu");
	expect(button).toHaveAttribute("aria-expanded", "false");

	fireEvent.click(button);
	await waitFor(() => {
		expect(button).toHaveAttribute("aria-expanded", "true");
	});
	expect(button).toHaveAttribute("data-state", "open");
	expect(document.getElementById(button.id)).toBe(button);
	const menu = await screen.findByRole("menu", { hidden: true });
	expect(button).toHaveAttribute("aria-controls", menu.id);

	fireEvent.pointerMove(button);
	const tooltip = await screen.findByText("More", {
		selector: "[data-part='content'] *, [data-part='content']",
	});
	expect(tooltip).toBeInTheDocument();
	const tooltipTrigger = document.querySelector(
		"[id^='tooltip:'][id$=':trigger']"
	);
	expect(tooltipTrigger).not.toBeNull();
	expect(tooltipTrigger).not.toBe(button);
	expect(tooltipTrigger?.contains(button)).toBe(true);
});

test("a morph out of an item of its closed menu lands on this trigger", async () => {
	// jsdom does no layout and loads no stylesheet: give every element a box,
	// and hide a closed menu the way the popover animation mixin does.
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	const closedMenu = document.createElement("style");
	closedMenu.textContent = `[data-part="content"][data-state="closed"] { visibility: hidden; }`;
	document.head.append(closedMenu);
	onTestFinished(() => {
		closedMenu.remove();
	});
	render(() => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						triggerProps={triggerProps()}
					>
						more_vert
					</IconButton>
				)}
			/>
			<Menu.Content>
				<Menu.Item value="a">A</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	));
	const button = screen.getByRole("button", { name: "More" });
	fireEvent.click(button);
	const item = await screen.findByRole("menuitem", { hidden: true });
	expect(nearestVisibleAnchor(item)).toBe(item);
	fireEvent.click(button);
	await waitFor(() => {
		expect(button).toHaveAttribute("aria-expanded", "false");
	});
	expect(nearestVisibleAnchor(item)).toBe(button);
});

test("triggerProps keep the outer machine's onClick beside the IconButton's own", () => {
	const calls: string[] = [];
	render(() => (
		<IconButton
			tooltipLabel="Open"
			triggerProps={{
				onClick: () => {
					calls.push("trigger");
				},
			}}
			onClick={() => {
				calls.push("own");
			}}
		>
			add
		</IconButton>
	));
	fireEvent.click(screen.getByRole("button", { name: "Open" }));
	expect(calls).toEqual(["trigger", "own"]);
});

test("as a menu trigger, keyboard focus on the button opens its tooltip and blur closes it", async () => {
	render(() => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						triggerProps={triggerProps()}
					>
						more_vert
					</IconButton>
				)}
			/>
			<Menu.Content>
				<Menu.Item value="a">A</Menu.Item>
			</Menu.Content>
		</Menu.Root>
	));
	const button = screen.getByRole("button", { name: "More" });
	const wrapper = button.closest("[id^='tooltip:']");
	expect(wrapper).not.toBeNull();
	expect(wrapper).toHaveAttribute("data-state", "closed");

	fireEvent.keyDown(document, { key: "Tab" });
	button.focus();
	await waitFor(() => {
		expect(wrapper).toHaveAttribute("data-state", "open");
	});
	const tooltip = await screen.findByRole("tooltip", { hidden: true });
	expect(button).toHaveAttribute("aria-describedby", tooltip.id);

	button.blur();
	await waitFor(() => {
		expect(wrapper).toHaveAttribute("data-state", "closed");
	});
});

test("a badge sits in the corner, hidden from assistive tech, and badgeLabel joins the accessible name", () => {
	const { container } = render(() => (
		<IconButton
			tooltipLabel="Notifications"
			badge="3"
			badgeLabel="3 unread"
		>
			notifications
		</IconButton>
	));
	expect(
		screen.getByRole("button", { name: "Notifications, 3 unread" })
	).toBeInTheDocument();
	const badge = container.querySelector("[data-badge]");
	expect(badge).toHaveTextContent("3");
	expect(badge).toHaveAttribute("aria-hidden", "true");
});

test("without badgeLabel the accessible name stays the tooltip label", () => {
	render(() => (
		<IconButton tooltipLabel="Notifications" badge="3">
			notifications
		</IconButton>
	));
	expect(
		screen.getByRole("button", { name: "Notifications" })
	).toBeInTheDocument();
});

test("badgeLabel without a badge stays out of the accessible name", () => {
	render(() => (
		<IconButton tooltipLabel="Notifications" badgeLabel="3 unread">
			notifications
		</IconButton>
	));
	expect(
		screen.getByRole("button", { name: "Notifications" })
	).toBeInTheDocument();
});

test("no badge renders no badge", () => {
	const { container } = render(() => (
		<IconButton tooltipLabel="Notifications">notifications</IconButton>
	));
	expect(container.querySelector("[data-badge]")).toBeNull();
});
