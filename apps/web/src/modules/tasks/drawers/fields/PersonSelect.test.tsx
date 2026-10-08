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

import { PersonSelect } from "./PersonSelect.tsx";

test("renders the selected person's name", () => {
	render(() => (
		<PersonSelect
			people={[
				{ _id: "p1", firstName: "Ada", lastName: "Lovelace" } as never,
			]}
			value={"p1" as never}
			onChange={() => {}}
		/>
	));
	expect(screen.getAllByText("Ada Lovelace")[0]).toBeInTheDocument();
});
