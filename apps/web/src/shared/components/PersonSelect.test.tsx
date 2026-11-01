// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { PersonSelect } from "./PersonSelect.tsx";

afterEach(cleanup);

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
