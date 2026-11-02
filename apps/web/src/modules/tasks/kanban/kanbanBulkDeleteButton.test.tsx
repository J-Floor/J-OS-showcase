// @vitest-environment happy-dom
import { ShortcutPeekProvider } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";
import type { TaskActions } from "../data/tasksData.tsx";
import { BulkDeleteButton, TasksTabActions } from "../TasksTabActions.tsx";

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => {} }),
}));

import {
	createBulkDelete,
	createMarqueeSelection,
} from "./kanbanInteraction.ts";

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function renderHarness() {
	const selection = createMarqueeSelection();
	let bulk: ReturnType<typeof createBulkDelete> | undefined;
	render(() => {
		bulk = createBulkDelete({
			selection,
			actions: { remove: vi.fn() } as unknown as TaskActions,
		});
		return (
			<ShortcutPeekProvider>
				<ShortcutPeekButton />
				<BulkDeleteButton bulkDelete={bulk} />
			</ShortcutPeekProvider>
		);
	});
	return { selection, bulk: () => bulk! };
}

test("the button shows only while cards are selected, and counts them", () => {
	const { selection } = renderHarness();
	expect(screen.queryByRole("button", { name: /selected/ })).toBeNull();
	selection.setSelected(new Set(["a", "b"]));
	expect(
		screen.getByRole("button", { name: /Delete 2 selected/ })
	).toHaveAttribute("aria-keyshortcuts", "Delete");
});

test("clicking it opens the confirm", () => {
	const { selection, bulk } = renderHarness();
	selection.setSelected(new Set(["a"]));
	fireEvent.click(screen.getByRole("button", { name: /Delete 1 selected/ }));
	expect(bulk().confirmOpen()).toBe(true);
});

test("the key opens the confirm, and not while typing", () => {
	const { selection, bulk } = renderHarness();
	selection.setSelected(new Set(["a"]));
	const field = document.createElement("input");
	document.body.append(field);
	fireEvent.keyDown(field, { key: "Delete" });
	expect(bulk().confirmOpen()).toBe(false);
	fireEvent.keyDown(document.body, { key: "Delete" });
	expect(bulk().confirmOpen()).toBe(true);
});

test("shows the key's chip while peeking", () => {
	const { selection } = renderHarness();
	selection.setSelected(new Set(["a"]));
	const button = screen.getByRole("button", { name: /Delete 1 selected/ });
	expect(button.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(button.querySelector("kbd")).not.toBeNull();
});

/** The Tasks tab's whole header, at a phone's width or a wide screen's. */
function renderTabActions(isPhone: boolean) {
	vi.stubGlobal("matchMedia", () => ({ matches: isPhone }));
	const selection = createMarqueeSelection();
	render(() => (
		<TasksTabActions
			options={() => [{ value: "everyone", label: "Everyone" }]}
			assignee={() => "everyone"}
			onAssigneeChange={() => {}}
			newTask={{
				id: "new-task",
				label: "New task",
				icon: "add",
				hotkey: "N",
				can: () => true,
				run: () => {},
			}}
			bulkDelete={createBulkDelete({
				selection,
				actions: { remove: vi.fn() } as unknown as TaskActions,
			})}
		/>
	));
	return selection;
}

function assigneeFilter(): HTMLElement | null {
	return screen.queryByRole("combobox", { name: "Assignee" });
}

test("on a phone the selection's Delete takes the assignee filter's place, so the pill keeps its width", () => {
	const selection = renderTabActions(true);
	expect(assigneeFilter()).not.toBeNull();
	selection.setSelected(new Set(["a", "b"]));
	expect(
		screen.getByRole("button", { name: /Delete 2 selected/ })
	).toBeTruthy();
	expect(assigneeFilter()).toBeNull();
	expect(screen.getByRole("button", { name: /New task/ })).toBeTruthy();
	selection.setSelected(new Set<string>());
	expect(assigneeFilter()).not.toBeNull();
});

test("on a wide screen the assignee filter stays beside the selection's Delete", () => {
	const selection = renderTabActions(false);
	selection.setSelected(new Set(["a"]));
	expect(
		screen.getByRole("button", { name: /Delete 1 selected/ })
	).toBeTruthy();
	expect(assigneeFilter()).not.toBeNull();
});

test("on a phone the selection's Delete is compact: its icon and the count, named in full", () => {
	const selection = renderTabActions(true);
	selection.setSelected(new Set(["a", "b", "c"]));
	const button = screen.getByRole("button", { name: "Delete 3 selected" });
	expect(button).toHaveTextContent("3");
	expect(button).not.toHaveTextContent("Delete 3 selected");
});

test("on a wide screen the selection's Delete shows its full label", () => {
	const selection = renderTabActions(false);
	selection.setSelected(new Set(["a", "b", "c"]));
	expect(
		screen.getByRole("button", { name: /Delete 3 selected/ })
	).toHaveTextContent("Delete 3 selected");
});
