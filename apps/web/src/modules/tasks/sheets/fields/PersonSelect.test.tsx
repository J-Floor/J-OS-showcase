// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
afterEach(cleanup);

import { AssigneeSelect } from "./AssigneeSelect.tsx";
import { PersonSelect } from "./PersonSelect.tsx";

test("renders the selected person's name", () => {
	render(() => (
		<PersonSelect
			label="Leader"
			people={[
				{ _id: "p1", firstName: "Ada", lastName: "Lovelace" } as never,
			]}
			value={"p1" as never}
			onChange={() => {}}
		/>
	));
	expect(screen.getAllByText("Ada Lovelace")[0]).toBeInTheDocument();
});

test("AssigneeSelect renders each selected person's name", () => {
	render(() => (
		<AssigneeSelect
			label="Assignees"
			people={[
				{ _id: "p1", firstName: "Ada", lastName: "Lovelace" } as never,
				{ _id: "p2", firstName: "Alan", lastName: "Turing" } as never,
			]}
			value={["p1", "p2"] as never}
			onChange={() => {}}
		/>
	));
	expect(screen.getAllByText("Ada Lovelace")[0]).toBeInTheDocument();
	expect(screen.getAllByText("Alan Turing")[0]).toBeInTheDocument();
});
