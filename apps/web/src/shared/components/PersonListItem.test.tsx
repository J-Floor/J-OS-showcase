// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { PersonListItem } from "./PersonListItem.tsx";

afterEach(cleanup);

test("renders the name, the detail line and the trailing slot", () => {
	render(() => (
		<PersonListItem name="Ada Example" detail="ada@example.com">
			<span>Pending</span>
		</PersonListItem>
	));
	expect(screen.getByText("Ada Example")).toBeInTheDocument();
	expect(screen.getByText("ada@example.com")).toBeInTheDocument();
	expect(screen.getByText("Pending")).toBeInTheDocument();
});

test("renders no detail line or trailing slot when none is given", () => {
	const { container } = render(() => <PersonListItem name="Bea Example" />);
	expect(screen.getByText("Bea Example")).toBeInTheDocument();
	// Avatar and the name column only: no trailing slot.
	expect(container.firstElementChild?.children).toHaveLength(2);
});

test("builds the trailing content once", () => {
	let builds = 0;
	function Trailing() {
		builds += 1;
		return <span>Pending</span>;
	}
	render(() => (
		<PersonListItem name="Cy Example">
			<Trailing />
		</PersonListItem>
	));
	expect(builds).toBe(1);
});
