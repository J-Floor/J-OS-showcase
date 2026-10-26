// @vitest-environment happy-dom
import { Sheet } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { SheetNavState } from "../../lib/createSheetNav.ts";

import { EntitySheetHeader } from "./EntitySheetHeader.tsx";

afterEach(cleanup);

/** `actions` is built inside the sheet, where its parts find their context. */
function renderHeader(actions?: () => JSX.Element, nav?: SheetNavState): void {
	render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<EntitySheetHeader.Root title="Fix the bug" nav={nav}>
				{actions?.()}
			</EntitySheetHeader.Root>
		</Sheet.Root>
	));
}

test("Delete is a button named by its label that runs onDelete", () => {
	const onDelete = vi.fn();
	renderHeader(() => (
		<EntitySheetHeader.Delete label="Delete task" onDelete={onDelete} />
	));
	fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("without a Delete part the header has no delete button", () => {
	renderHeader();
	expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
});

/** Whether `first` comes before `second` in the document. */
function precedes(first: Element, second: Element): boolean {
	return Boolean(
		first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
	);
}

test("its children sit after prev/next and before close", () => {
	renderHeader(
		() => (
			<EntitySheetHeader.Delete label="Delete task" onDelete={() => {}} />
		),
		{
			hasPrev: () => true,
			hasNext: () => true,
			onPrev: () => {},
			onNext: () => {},
		}
	);
	const next = screen.getByRole("button", { name: /next/i });
	const remove = screen.getByRole("button", { name: "Delete task" });
	const close = screen.getByRole("button", { name: /close/i });
	expect(precedes(next, remove)).toBe(true);
	expect(precedes(remove, close)).toBe(true);
});

test("an existing row's header shows the save status first; a create form's has none", () => {
	const { unmount } = render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<EntitySheetHeader.Root title="Fix the bug" saveStatus>
				<EntitySheetHeader.Delete
					label="Delete task"
					onDelete={() => {}}
				/>
			</EntitySheetHeader.Root>
		</Sheet.Root>
	));
	const status = screen.getByRole("status", { name: "Save status" });
	expect(
		precedes(status, screen.getByRole("button", { name: "Delete task" }))
	).toBe(true);
	unmount();
	renderHeader();
	expect(screen.queryByRole("status", { name: "Save status" })).toBeNull();
});
