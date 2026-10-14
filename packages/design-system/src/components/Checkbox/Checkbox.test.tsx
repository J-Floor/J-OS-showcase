import { render, screen, fireEvent } from "@solidjs/testing-library";

import { Checkbox } from "./Checkbox.tsx";

test("toggles checked", async () => {
	let checkedState: boolean | "indeterminate" = false;
	render(() => (
		<Checkbox
			checked={checkedState}
			onCheckedChange={(details) => (checkedState = details.checked)}
		/>
	));
	fireEvent.click(screen.getByRole("checkbox"));
	// Zag's checkbox machine dispatches onCheckedChange on a microtask, so the
	// callback resolves on the next tick rather than synchronously after click.
	await vi.waitFor(() => {
		expect(checkedState).toBe(true);
	});
});

test("renders a label when children are provided", () => {
	render(() => <Checkbox>Accept</Checkbox>);
	expect(screen.getByText("Accept")).toBeInTheDocument();
});

test("renders the indeterminate dash indicator", () => {
	render(() => <Checkbox checked="indeterminate" />);
	expect(screen.getByText("remove")).toBeInTheDocument();
});
