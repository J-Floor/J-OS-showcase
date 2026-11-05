// @vitest-environment happy-dom
import { ShortcutPeekProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { ShortcutPeekButton } from "../ShortcutPeekButton.tsx";

import { ActionBar } from "./ActionBar.tsx";
import type { ActionDescriptor } from "./shortcuts.ts";

afterEach(cleanup);

type Target = { id: string; status: "open" | "done" };

const OPEN: Target = { id: "a", status: "open" };

/** A run that stays in flight until `settle` is called. */
function inFlight<T>(value: T): { promise: Promise<T>; settle: () => void } {
	let resolve: ((settled: T) => void) | undefined;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return {
		promise,
		settle() {
			resolve?.(value);
		},
	};
}

function harness() {
	const ran: string[] = [];
	const actions: ActionDescriptor<Target>[] = [
		{
			id: "close",
			label: "Close it",
			icon: "check",
			hotkey: "C",
			can: (target) => target.status === "open",
			disabledReason: () => "Already closed",
			run: (target) => {
				ran.push(`close:${target.id}`);
			},
		},
		{
			id: "reopen",
			label: "Reopen it",
			icon: "undo",
			hotkey: "R",
			can: (target) => target.status === "done",
			run: (target) => {
				ran.push(`reopen:${target.id}`);
			},
		},
	];
	return { ran, actions };
}

test("renders a button per action and runs it on the target", () => {
	const { ran, actions } = harness();
	render(() => <ActionBar actions={actions} target={OPEN} />);
	fireEvent.click(screen.getByRole("button", { name: /Close it/ }));
	expect(ran).toEqual(["close:a"]);
	expect(screen.getByRole("button", { name: /Close it/ })).toHaveAttribute(
		"aria-keyshortcuts",
		"C"
	);
});

test("an action the target cannot take is disabled with its reason", () => {
	const { ran, actions } = harness();
	render(() => (
		<ActionBar actions={actions} target={{ id: "b", status: "done" }} />
	));
	const close = screen.getByRole("button", { name: /Close it/ });
	expect(close).toBeDisabled();
	expect(close).toHaveAttribute("aria-description", "Already closed");
	expect(
		screen.getByRole("button", { name: /Reopen it/ })
	).not.toBeDisabled();
	fireEvent.click(close);
	expect(ran).toEqual([]);
});

test("without a reason, a disabled action repeats its label", () => {
	const { actions } = harness();
	render(() => <ActionBar actions={actions} target={OPEN} />);
	expect(screen.getByRole("button", { name: /Reopen it/ })).toHaveAttribute(
		"aria-description",
		"Reopen it"
	);
});

test("hideUnavailable leaves out what the target cannot take", () => {
	const { actions } = harness();
	render(() => <ActionBar actions={actions} target={OPEN} hideUnavailable />);
	expect(
		screen.getByRole("button", { name: /Close it/ })
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Reopen it/ })
	).not.toBeInTheDocument();
});

test("shows the icon, and the key chip in its place while peeking", () => {
	const { actions } = harness();
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<ActionBar actions={actions} target={OPEN} hideUnavailable />
		</ShortcutPeekProvider>
	));
	const close = screen.getByRole("button", { name: /Close it/ });
	expect(close.querySelector("[data-icon]")).not.toBeNull();
	expect(close.querySelector("kbd")).toBeNull();

	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));

	expect(close.querySelector("kbd")).not.toBeNull();
	expect(close.querySelector("[data-icon]")).toBeNull();
});

test("a disabled celebrated action sits in the shape the full-width rule targets", () => {
	const { actions } = harness();
	const celebrated = actions.map((action) => ({
		...action,
		celebrate: true,
	}));
	const { container } = render(() => (
		<ActionBar actions={celebrated} target={OPEN} />
	));
	const bar = container.firstElementChild;
	const reopen = screen.getByRole("button", { name: /Reopen it/ });
	expect(reopen).toBeDisabled();
	// `.bar > * > [data-disabled] > button`: Confetti, then the disabled
	// reason's wrapper, then the button. A deeper or different nesting would
	// leave the button hugging its label.
	const disabledWrapper = reopen.parentElement;
	expect(disabledWrapper).toHaveAttribute("data-disabled");
	expect(disabledWrapper?.parentElement?.parentElement).toBe(bar);
});

test("an action in flight shows its spinner and is disabled until it settles", async () => {
	const run = inFlight({ refused: false });
	const runs: string[] = [];
	const slow: ActionDescriptor<Target> = {
		id: "send",
		label: "Send it",
		icon: "send",
		hotkey: "S",
		can: () => true,
		run: (target) => {
			runs.push(target.id);
			return run.promise;
		},
	};
	render(() => <ActionBar actions={[slow]} target={OPEN} />);
	const send = screen.getByRole("button", { name: /Send it/ });
	expect(send).not.toHaveAttribute("aria-busy", "true");
	fireEvent.click(send);
	expect(send).toHaveAttribute("aria-busy", "true");
	fireEvent.click(send);
	expect(runs).toEqual(["a"]);
	run.settle();
	await waitFor(() => {
		expect(send).not.toHaveAttribute("aria-busy", "true");
	});
});

test("only an action marked primary is a primary button", () => {
	const base = {
		icon: "check",
		can: () => true,
		run: (): undefined => {},
	};
	const actions: ActionDescriptor<Target>[] = [
		{ ...base, id: "main", label: "Main", hotkey: "M", primary: true },
		{ ...base, id: "other", label: "Other", hotkey: "O" },
	];
	render(() => (
		<ShortcutPeekProvider>
			<ActionBar actions={actions} target={OPEN} />
		</ShortcutPeekProvider>
	));
	expect(screen.getByRole("button", { name: /Main/ })).toHaveAttribute(
		"data-variant",
		"primary"
	);
	expect(screen.getByRole("button", { name: /Other/ })).toHaveAttribute(
		"data-variant",
		"secondary"
	);
});
