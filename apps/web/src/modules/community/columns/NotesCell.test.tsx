// @vitest-environment happy-dom
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

import { NotesCell } from "./applicationColumns.tsx";

afterEach(() => {
	cleanup();
	addNote.mockReset();
});

const row = { _id: "p1", board: { noteLog: [] } } as unknown as Doc<"people">;

test("a refused note keeps the draft, says why, and blur does not resend it", async () => {
	addNote.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	render(() => <NotesCell row={row} />);
	const input = screen.getByLabelText("Add a note");
	fireEvent.input(input, { target: { value: "call back" } });
	fireEvent.keyDown(input, { key: "Enter" });

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"You can't do that."
	);
	expect(input).toHaveValue("call back");

	fireEvent.blur(input);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(addNote).toHaveBeenCalledTimes(1);

	// Enter is an explicit retry.
	addNote.mockResolvedValueOnce(null);
	fireEvent.keyDown(input, { key: "Enter" });
	await vi.waitFor(() => {
		expect(addNote).toHaveBeenCalledTimes(2);
	});
});
