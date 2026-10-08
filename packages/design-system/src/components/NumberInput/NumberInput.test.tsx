import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { NumberInput } from "./NumberInput.tsx";

// zag's number-input commits values asynchronously and calls `scrollTo` on the
// input after a change — jsdom lacks it, so stub it on the prototype.
beforeAll(() => {
	if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
		Element.prototype.scrollTo = () => {};
	}
});

test("increments via increment trigger", async () => {
	let val: string | undefined;
	render(() => (
		<NumberInput
			label="N"
			min={0}
			max={5}
			onValueChange={(d) => (val = d.value)}
		/>
	));
	// zag increments on pointerDown (the trigger spins on press), not click.
	fireEvent.pointerDown(screen.getByLabelText("Increment"));
	await waitFor(() => {
		expect(val).toBe("1");
	});
});

test("renders label and a single button per trigger (no nested buttons)", () => {
	const { container } = render(() => <NumberInput label="Count" />);
	expect(screen.getByText("Count")).toBeInTheDocument();
	expect(screen.getByLabelText("Increment")).toBeInTheDocument();
	expect(screen.getByLabelText("Decrement")).toBeInTheDocument();
	expect(container.querySelectorAll("button button").length).toBe(0);
});

test("onlyAllowTyping hides the increment/decrement control", () => {
	render(() => <NumberInput label="N" onlyAllowTyping />);
	expect(screen.queryByLabelText("Increment")).not.toBeInTheDocument();
	expect(screen.queryByLabelText("Decrement")).not.toBeInTheDocument();
	expect(screen.getByRole("spinbutton")).toBeInTheDocument();
});

test("renders a leading icon when leadingIconName is set", () => {
	render(() => <NumberInput label="N" leadingIconName="tag" />);
	expect(screen.getByText("tag")).toBeInTheDocument();
});

test("allowClearing shows a clear button only while the value is non-empty", async () => {
	render(() => <NumberInput label="N" allowClearing defaultValue="3" />);
	const clear = await screen.findByLabelText("Clear");
	expect(clear).toBeInTheDocument();
	// Clearing empties the input, and the button removes itself once empty.
	fireEvent.click(clear);
	await waitFor(() => {
		expect(screen.queryByLabelText("Clear")).not.toBeInTheDocument();
	});
	expect(screen.getByRole("spinbutton")).toHaveValue("");
});

test("allowClearing renders no clear button while empty", () => {
	render(() => <NumberInput label="N" allowClearing />);
	expect(screen.queryByLabelText("Clear")).not.toBeInTheDocument();
});

test("no clear button without allowClearing, even with a value", () => {
	render(() => <NumberInput label="N" defaultValue="3" />);
	expect(screen.queryByLabelText("Clear")).not.toBeInTheDocument();
});

test("throws on a non-numeric string min", () => {
	expect(() => render(() => <NumberInput label="N" min="abc" />)).toThrow(
		/Invalid min value "abc"/
	);
});

test("mid-range steppers announce no bound reason", () => {
	render(() => <NumberInput label="N" min={0} max={5} defaultValue="2" />);
	expect(screen.getByLabelText("Increment")).not.toHaveAttribute(
		"aria-description"
	);
	expect(screen.getByLabelText("Decrement")).not.toHaveAttribute(
		"aria-description"
	);
});

test("the increment stepper announces the max once it is reached", async () => {
	render(() => <NumberInput label="N" min={0} max={5} defaultValue="5" />);
	await waitFor(() => {
		expect(screen.getByLabelText("Increment")).toHaveAttribute(
			"aria-description",
			"Maximum allowed value reached"
		);
	});
	expect(screen.getByLabelText("Decrement")).not.toHaveAttribute(
		"aria-description"
	);
});
