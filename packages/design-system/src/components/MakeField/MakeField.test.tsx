import { Field } from "@ark-ui/solid/field";
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
	let isClicked = false;
	render(() => (
		<MakeField label="Click me" onLabelClicked={() => (isClicked = true)}>
			<input />
		</MakeField>
	));
	screen.getByText("Click me").click();
	expect(isClicked).toBe(true);
});

test("the label names the control", () => {
	render(() => (
		<MakeField label="Email">
			<Field.Input />
		</MakeField>
	));
	expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
});

test("labelHidden hides the label and keeps it as the control's name", () => {
	render(() => (
		<MakeField label="Email" labelHidden>
			<Field.Input />
		</MakeField>
	));
	expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
	expect(screen.getByText("Email")).toHaveAttribute("data-hidden");
});

test("a visible label carries no hidden marker", () => {
	render(() => (
		<MakeField label="Email">
			<Field.Input />
		</MakeField>
	));
	expect(screen.getByText("Email")).not.toHaveAttribute("data-hidden");
});

test("labelHidden does not reach the field root as an attribute", () => {
	const { container } = render(() => (
		<MakeField label="Email" labelHidden>
			<Field.Input />
		</MakeField>
	));
	expect(container.querySelector("[labelhidden]")).toBeNull();
});

test("an empty label warns in development", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	render(() => (
		<MakeField label="  ">
			<Field.Input />
		</MakeField>
	));
	expect(warn).toHaveBeenCalledWith(expect.stringContaining("labelHidden"));
	warn.mockRestore();
});

test("a real label does not warn", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	render(() => (
		<MakeField label="Email" labelHidden>
			<Field.Input />
		</MakeField>
	));
	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});
