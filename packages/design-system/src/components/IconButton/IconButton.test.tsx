import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import type { Hotkey } from "@tanstack/solid-hotkeys";
import { createSignal } from "solid-js";

import type { TriggerProps } from "../../utils/triggerProps.ts";
import { Menu } from "../Menu/Menu.tsx";

import { IconButton } from "./IconButton.tsx";

test("renders icon ligature, exposes accessible name via tooltip label", () => {
	render(() => <IconButton tooltipLabel="Add">add</IconButton>);
	expect(screen.getByText("add")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
});

test("does not nest interactive elements (no <button><button>)", () => {
	const { container } = render(() => (
		<IconButton tooltipLabel="Add">add</IconButton>
	));
	expect(container.querySelectorAll("button button").length).toBe(0);
	expect(container.querySelectorAll("button").length).toBe(1);
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

test("fires onClick", () => {
	let clicked = false;
	render(() => (
		<IconButton
			tooltipLabel="Add"
			onClick={() => {
				clicked = true;
			}}
		>
			add
		</IconButton>
	));
	screen.getByRole("button", { name: "Add" }).click();
	expect(clicked).toBe(true);
});

test("when disabled, renders bare without a tooltip trigger and is non-interactive", () => {
	let clicked = false;
	render(() => (
		<IconButton
			tooltipLabel="Add"
			disabled
			shamefullyOmitDisabledReason
			onClick={() => {
				clicked = true;
			}}
		>
			add
		</IconButton>
	));
	const btn = screen.getByRole("button", { name: "Add" });
	btn.click();
	expect(clicked).toBe(false);
	expect(btn).toBeDisabled();
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

test("as a menu trigger it keeps the menu's id and state while its tooltip still opens", async () => {
	render(() => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						triggerProps={triggerProps() as TriggerProps}
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

test("as a menu trigger, keyboard focus on the button opens its tooltip and blur closes it", async () => {
	render(() => (
		<Menu.Root>
			<Menu.Trigger
				asChild={(triggerProps) => (
					<IconButton
						tooltipLabel="More"
						triggerProps={triggerProps() as TriggerProps}
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
