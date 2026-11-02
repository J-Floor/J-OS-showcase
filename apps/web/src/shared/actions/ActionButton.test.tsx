// @vitest-environment happy-dom
import { Sheet, ShortcutPeekProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { ConfirmProvider, useConfirm } from "../confirm.tsx";
import { ShortcutPeekButton } from "../ShortcutPeekButton.tsx";

import { ActionButton } from "./ActionButton.tsx";
import { deleteAction } from "./sheetActions.tsx";
import type { ActionDescriptor } from "./shortcuts.ts";

afterEach(cleanup);

const PAST_TOOLTIP_DELAY_MS = 1000;

type Page = "page";

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

function newThing(options: {
	isAvailable?: boolean;
	run?: () => Promise<undefined>;
	ran: string[];
}): ActionDescriptor<Page> {
	return {
		id: "new-thing",
		label: "New thing",
		icon: "add",
		hotkey: "N",
		can: () => options.isAvailable ?? true,
		disabledReason: () => "Nothing to add to",
		run: (target) => {
			options.ran.push(target);
			return options.run?.();
		},
	};
}

test("runs the action on its target, and names its key", () => {
	const ran: string[] = [];
	render(() => <ActionButton action={newThing({ ran })} target="page" />);
	const button = screen.getByRole("button", { name: /New thing/ });
	expect(button).toHaveAttribute("aria-keyshortcuts", "N");
	fireEvent.click(button);
	expect(ran).toEqual(["page"]);
});

test("an action the target cannot take is disabled with its reason", () => {
	const ran: string[] = [];
	render(() => (
		<ActionButton
			action={newThing({ ran, isAvailable: false })}
			target="page"
		/>
	));
	const button = screen.getByRole("button", { name: /New thing/ });
	expect(button).toBeDisabled();
	expect(button).toHaveAttribute("aria-description", "Nothing to add to");
	fireEvent.click(button);
	expect(ran).toEqual([]);
});

test("shows the icon, and the key chip in its place while peeking", () => {
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<ActionButton action={newThing({ ran: [] })} target="page" />
		</ShortcutPeekProvider>
	));
	const button = screen.getByRole("button", { name: /New thing/ });
	expect(button.querySelector("[data-icon]")).not.toBeNull();
	expect(button.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(button.querySelector("kbd")).not.toBeNull();
	expect(button.querySelector("[data-icon]")).toBeNull();
});

test("a run in flight shows the spinner and swallows a second click", async () => {
	const ran: string[] = [];
	const run = inFlight(undefined);
	const action = newThing({ ran, run: () => run.promise });
	render(() => <ActionButton action={action} target="page" />);
	const button = screen.getByRole("button", { name: /New thing/ });
	fireEvent.click(button);
	expect(button).toHaveAttribute("aria-busy", "true");
	fireEvent.click(button);
	expect(ran).toEqual(["page"]);
	run.settle();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy", "true");
	});
});

test("work the action does not run itself (a check the page started) shows the spinner too", () => {
	const [isSubmitting, setSubmitting] = createSignal(false);
	const action: ActionDescriptor<Page> = {
		...newThing({ ran: [] }),
		isBusy: () => isSubmitting(),
	};
	render(() => <ActionButton action={action} target="page" />);
	const button = screen.getByRole("button", { name: /New thing/ });
	expect(button).not.toHaveAttribute("aria-busy", "true");
	setSubmitting(true);
	expect(button).toHaveAttribute("aria-busy", "true");
});

test("a batch run is held by its rows, though each read of the selection is a new array", async () => {
	type Row = { _id: string };
	const ran: number[] = [];
	const run = inFlight(undefined);
	const [tick, setTick] = createSignal(0);
	const batchDelete: ActionDescriptor<Row[]> = {
		id: "batch-delete",
		label: "Delete",
		icon: "delete",
		hotkey: "Delete",
		can: (rows) => rows.length > 0,
		run: (rows) => {
			ran.push(rows.length);
			return run.promise;
		},
	};
	// A fresh array per read, in another order, as a selection hook returns.
	function rows(): Row[] {
		return tick() === 0
			? [{ _id: "b" }, { _id: "a" }]
			: [{ _id: "a" }, { _id: "b" }];
	}
	render(() => <ActionButton action={batchDelete} target={rows()} />);
	const button = screen.getByRole("button", { name: /Delete/ });
	fireEvent.click(button);
	setTick(1);
	expect(button).toHaveAttribute("aria-busy", "true");
	fireEvent.click(button);
	expect(ran).toEqual([2]);
	run.settle();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy", "true");
	});
});

test("a batch of rows without ids is held by the array itself", () => {
	const ran: number[] = [];
	const run = inFlight(undefined);
	const batch: ActionDescriptor<string[]> = {
		id: "batch-print",
		label: "Print",
		icon: "print",
		hotkey: "P",
		can: () => true,
		run: (rows) => {
			ran.push(rows.length);
			return run.promise;
		},
	};
	const labels = ["one", "two"];
	render(() => <ActionButton action={batch} target={labels} />);
	const button = screen.getByRole("button", { name: /Print/ });
	fireEvent.click(button);
	expect(button).toHaveAttribute("aria-busy", "true");
	fireEvent.click(button);
	expect(ran).toEqual([2]);
	run.settle();
});

test("a button under an open sheet shows its icon, not its key chip, while peeking: its key is quiet", async () => {
	const [isOpen, setOpen] = createSignal(false);
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<ActionButton action={newThing({ ran: [] })} target="page" />
			<Sheet.Root open={isOpen()} onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>Covering sheet</Sheet.Title>
				</Sheet.Header>
			</Sheet.Root>
		</ShortcutPeekProvider>
	));
	const button = screen.getByRole("button", { name: /New thing/ });
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(button.querySelector("kbd")).not.toBeNull();
	setOpen(true);
	await waitFor(() => {
		expect(button.querySelector("kbd")).toBeNull();
	});
	expect(button.querySelector("[data-icon]")).not.toBeNull();
	setOpen(false);
	await waitFor(() => {
		expect(button.querySelector("kbd")).not.toBeNull();
	});
});

test("while the run's confirm covers the button it keeps its label; once answered, the write shows the spinner", async () => {
	const [isAsking, setAsking] = createSignal(false);
	const write = inFlight(undefined);
	const action: ActionDescriptor<Page> = {
		...newThing({ ran: [] }),
		run: () => {
			setAsking(true);
			return write.promise;
		},
	};
	render(() => (
		<>
			<ActionButton action={action} target="page" />
			<Sheet.Root open={isAsking()} onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>Confirm</Sheet.Title>
				</Sheet.Header>
			</Sheet.Root>
		</>
	));
	const button = screen.getByRole("button", { name: /New thing/ });
	fireEvent.click(button);
	expect(button).not.toHaveAttribute("aria-busy", "true");
	setAsking(false);
	await waitFor(() => {
		expect(button).toHaveAttribute("aria-busy", "true");
	});
	write.settle();
	await waitFor(() => {
		expect(button).not.toHaveAttribute("aria-busy", "true");
	});
});

/** A `startViewTransition` that holds each update until `release`, as a
 *  browser does while it captures the old page: an overlay opened through a
 *  morph is not shown (nor covers anything) until then. */
function heldViewTransitions(): { release: () => void } {
	const held: (() => void)[] = [];
	Object.assign(document, {
		startViewTransition: (update: () => Promise<void> | void) => {
			const updated = new Promise<void>((resolve) => {
				held.push(() => {
					void Promise.resolve(update()).then(resolve);
				});
			});
			return {
				ready: updated,
				updateCallbackDone: updated,
				finished: updated,
			};
		},
	});
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	return {
		release() {
			for (const update of held.splice(0)) update();
		},
	};
}

test("no spinner while the confirm is asked, even before its dialog is shown; once answered, the write shows it", async () => {
	const transitions = heldViewTransitions();
	const write = inFlight(undefined);
	type Row = { _id: string };
	function DeleteButton() {
		const confirm = useConfirm();
		const action = deleteAction<Row>({
			noun: "thing",
			ask: () => confirm({ title: "Delete thing?" }),
			remove: () => write.promise,
			error: () => null,
		});
		return <ActionButton action={action} target={{ _id: "one" }} />;
	}
	try {
		render(() => (
			<ConfirmProvider>
				<DeleteButton />
			</ConfirmProvider>
		));
		const button = screen.getByRole("button", { name: /Delete thing/ });
		fireEvent.click(button);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(button).not.toHaveAttribute("aria-busy", "true");
		transitions.release();
		const dialog = await screen.findByRole("dialog");
		expect(button).not.toHaveAttribute("aria-busy", "true");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Confirm" })
		);
		transitions.release();
		await waitFor(() => {
			transitions.release();
			expect(button).toHaveAttribute("aria-busy", "true");
		});
		write.settle();
		await waitFor(() => {
			expect(button).not.toHaveAttribute("aria-busy", "true");
		});
	} finally {
		Reflect.deleteProperty(document, "startViewTransition");
		vi.unstubAllGlobals();
	}
});

test("a compact label shows in place of the label, which names the button", () => {
	const ran: string[] = [];
	render(() => (
		<ActionButton
			action={newThing({ ran })}
			target="page"
			compactLabel="3"
		/>
	));
	const button = screen.getByRole("button", { name: "New thing" });
	expect(button).toHaveTextContent("3");
	expect(button).not.toHaveTextContent("New thing");
	fireEvent.click(button);
	expect(ran).toEqual(["page"]);
});

test("a compact label's tooltip shows the label without describing the button by it again", async () => {
	vi.useFakeTimers();
	try {
		render(() => (
			<ActionButton
				action={newThing({ ran: [] })}
				target="page"
				compactLabel="3"
			/>
		));
		const button = screen.getByRole("button", { name: "New thing" });
		fireEvent.pointerMove(button);
		await vi.advanceTimersByTimeAsync(PAST_TOOLTIP_DELAY_MS);
		expect(screen.getByRole("tooltip")).toHaveTextContent("New thing");
		expect(button).not.toHaveAttribute("aria-describedby");
	} finally {
		vi.useRealTimers();
	}
});

test("a compact button that turns disabled drops its label tooltip, leaving only the reason", async () => {
	vi.useFakeTimers();
	try {
		const [isAvailable, setAvailable] = createSignal(true);
		const action: ActionDescriptor<Page> = {
			...newThing({ ran: [] }),
			can: () => isAvailable(),
		};
		render(() => (
			<ActionButton action={action} target="page" compactLabel="3" />
		));
		const button = screen.getByRole("button", { name: "New thing" });
		fireEvent.pointerMove(button);
		await vi.advanceTimersByTimeAsync(PAST_TOOLTIP_DELAY_MS);
		expect(screen.getByRole("tooltip")).toHaveTextContent("New thing");
		setAvailable(false);
		await vi.advanceTimersByTimeAsync(PAST_TOOLTIP_DELAY_MS);
		const tooltips = screen.queryAllByRole("tooltip");
		expect(tooltips.map((tip) => tip.textContent)).not.toContain(
			"New thing"
		);
	} finally {
		vi.useRealTimers();
	}
});
