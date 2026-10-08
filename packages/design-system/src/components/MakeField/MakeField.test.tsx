import { render, screen } from "@solidjs/testing-library";

import { MakeField } from "./MakeField.tsx";

test("renders label + error text when invalid", () => {
	render(() => (
		<MakeField label="Name" invalid errorText="Required">
			<input />
		</MakeField>
	));
	expect(screen.getByText("Name")).toBeInTheDocument();
	expect(screen.getByText("Required")).toBeInTheDocument();
});

test("renders helper text when not invalid, hides it when invalid", () => {
	const { unmount } = render(() => (
		<MakeField label="Email" helperText="We never share it">
			<input />
		</MakeField>
	));
	expect(screen.getByText("We never share it")).toBeInTheDocument();
	unmount();

	render(() => (
		<MakeField
			label="Email"
			helperText="We never share it"
			invalid
			errorText="Bad email"
		>
			<input />
		</MakeField>
	));
	expect(screen.queryByText("We never share it")).not.toBeInTheDocument();
	expect(screen.getByText("Bad email")).toBeInTheDocument();
});

test("places children inside the field", () => {
	render(() => (
		<MakeField label="Q">
			<input data-testid="child-input" />
		</MakeField>
	));
	expect(screen.getByTestId("child-input")).toBeInTheDocument();
});

test("calls onLabelClicked when the label is clicked", () => {
	let clicked = false;
	render(() => (
		<MakeField label="Click me" onLabelClicked={() => (clicked = true)}>
			<input />
		</MakeField>
	));
	screen.getByText("Click me").click();
	expect(clicked).toBe(true);
});
