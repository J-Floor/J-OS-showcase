// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { SheetFooter } from "./SheetFooter.tsx";

afterEach(cleanup);

test("stacks the lead, then the error, then the actions", () => {
	render(() => (
		<SheetFooter lead={<span>Lead</span>} error="Could not save.">
			<button type="button">Act</button>
		</SheetFooter>
	));
	const lead = screen.getByText("Lead");
	const error = screen.getByRole("alert");
	const action = screen.getByRole("button", { name: "Act" });
	expect(error).toHaveTextContent("Could not save.");
	expect(
		lead.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
	expect(
		error.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

test("shows no error without one", () => {
	render(() => (
		<SheetFooter error={null}>
			<button type="button">Act</button>
		</SheetFooter>
	));
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
});
