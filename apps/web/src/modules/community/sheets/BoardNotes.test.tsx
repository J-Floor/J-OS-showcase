// @vitest-environment happy-dom
import { Sheet } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

const { addNote } = vi.hoisted(() => ({ addNote: vi.fn() }));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: addNote }),
}));

vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({ data: () => [] }),
}));

import type { Doc } from "../../../../convex/_generated/dataModel";

import { BoardNotes } from "./BoardNotes.tsx";

afterEach(() => {
	cleanup();
	addNote.mockReset();
});

const person = {
	_id: "p1",
	board: { noteLog: [] },
} as unknown as Doc<"people">;

function typeNote(text: string): void {
	fireEvent.input(screen.getByLabelText("Add a note"), {
		target: { value: text },
	});
}

test("a refused note keeps the draft and says why beside the composer", async () => {
	addNote.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	render(() => <BoardNotes person={person} />);
	typeNote("call them back");
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"You can't do that."
	);
	expect(screen.getByLabelText("Add a note")).toHaveValue("call them back");
});

/** The notes inside an open sheet that shows its save status. */
function renderInSheet(): void {
	render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<Sheet.Header>
				<Sheet.Title>Person</Sheet.Title>
				<Sheet.HeaderActions>
					<Sheet.SaveStatus />
				</Sheet.HeaderActions>
			</Sheet.Header>
			<BoardNotes person={person} />
		</Sheet.Root>
	));
}

function saveStatus(): HTMLElement {
	return screen.getByRole("status", { name: "Save status" });
}

test("adding a note reports Saving… then Changes saved to the sheet", async () => {
	addNote.mockResolvedValueOnce(null);
	renderInSheet();
	typeNote("call them back");
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	expect(saveStatus()).toHaveAttribute("data-state", "pending");
	await vi.waitFor(() => {
		expect(saveStatus()).toHaveAttribute("data-state", "saved");
	});
});

test("a refused note reads Couldn't save, and Retry sends the same note again", async () => {
	addNote.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	addNote.mockResolvedValueOnce(null);
	renderInSheet();
	typeNote("call them back");
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	await vi.waitFor(() => {
		expect(saveStatus()).toHaveAttribute("data-state", "failed");
	});
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await vi.waitFor(() => {
		expect(saveStatus()).toHaveAttribute("data-state", "saved");
	});
	expect(addNote).toHaveBeenCalledTimes(2);
	expect(addNote).toHaveBeenLastCalledWith({
		id: "p1",
		text: "call them back",
	});
});

test("a saved note clears the draft and shows no error", async () => {
	addNote.mockResolvedValueOnce(null);
	render(() => <BoardNotes person={person} />);
	typeNote("call them back");
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));

	await vi.waitFor(() => {
		expect(screen.getByLabelText("Add a note")).toHaveValue("");
	});
	expect(screen.queryByRole("alert")).toBeNull();
});
