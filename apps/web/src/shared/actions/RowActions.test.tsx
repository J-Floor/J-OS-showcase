// @vitest-environment happy-dom
import { Sheet, ShortcutPeekProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";

import { ShortcutPeekButton } from "../ShortcutPeekButton.tsx";

import { RowActionButton } from "./RowActions.tsx";
import type { ActionDescriptor } from "./shortcuts.ts";

afterEach(cleanup);

type Row = { _id: string };

function archive(
	ran: string[],
	pending: Promise<undefined>
): ActionDescriptor<Row> {
	return {
		id: "archive",
		label: "Archive",
		icon: "archive",
		hotkey: "A",
		can: () => true,
		run: (row) => {
			ran.push(row._id);
			return pending;
		},
	};
}

/** The Archive buttons, looked up afresh: loading swaps a button out (its
 *  tooltip goes). */
function buttons(): HTMLElement[] {
	return screen.getAllByRole("button", { name: "Archive" });
}

test("a row's run in flight shows the spinner and swallows a second click on that row", () => {
	const ran: string[] = [];
	const action = archive(ran, new Promise(() => {}));
	render(() => (
		<>
			<RowActionButton action={action} row={{ _id: "one" }} />
			<RowActionButton action={action} row={{ _id: "two" }} />
		</>
	));
	fireEvent.click(buttons()[0]);
	fireEvent.click(buttons()[0]);
	expect(buttons()[0]).toHaveAttribute("data-loading", "true");
	expect(buttons()[1]).not.toHaveAttribute("data-loading", "true");
	fireEvent.click(buttons()[1]);
	expect(ran).toEqual(["one", "two"]);
});

test("work the action reports itself shows the spinner", () => {
	const [isChecking, setChecking] = createSignal(false);
	const action: ActionDescriptor<Row> = {
		...archive([], Promise.resolve(undefined)),
		isBusy: () => isChecking(),
	};
	render(() => <RowActionButton action={action} row={{ _id: "one" }} />);
	expect(buttons()[0]).not.toHaveAttribute("data-loading", "true");
	setChecking(true);
	expect(buttons()[0]).toHaveAttribute("data-loading", "true");
});

test("a row button under an open sheet hides its key chip while peeking: its key is quiet", async () => {
	const [isOpen, setOpen] = createSignal(false);
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<RowActionButton
				action={archive([], Promise.resolve(undefined))}
				row={{ _id: "one" }}
			/>
			<Sheet.Root open={isOpen()} onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>Covering sheet</Sheet.Title>
				</Sheet.Header>
			</Sheet.Root>
		</ShortcutPeekProvider>
	));
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(buttons()[0].querySelector("kbd")).not.toBeNull();
	setOpen(true);
	await waitFor(() => {
		expect(buttons()[0].querySelector("kbd")).toBeNull();
	});
	setOpen(false);
	await waitFor(() => {
		expect(buttons()[0].querySelector("kbd")).not.toBeNull();
	});
});
