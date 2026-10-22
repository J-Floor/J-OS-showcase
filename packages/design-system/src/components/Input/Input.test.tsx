import { fireEvent, render, screen } from "@solidjs/testing-library";

import { Input } from "./Input.tsx";

test("calls onValueChange on input", () => {
	let value = "";
	render(() => (
		<Input
			label="Q"
			onValueChange={(event) => (value = event.currentTarget.value)}
		/>
	));
	fireEvent.input(screen.getByRole("textbox"), { target: { value: "hi" } });
	expect(value).toBe("hi");
});

test("merges onValueChange with onInput", () => {
	let fromInput = "";
	let fromValue = "";
	render(() => (
		<Input
			label="Q"
			onInput={(event) => (fromInput = event.currentTarget.value)}
			onValueChange={(event) => (fromValue = event.currentTarget.value)}
		/>
	));
	fireEvent.input(screen.getByRole("textbox"), { target: { value: "yo" } });
	expect(fromInput).toBe("yo");
	expect(fromValue).toBe("yo");
});

test("renders a leading icon when leadingIconName is given", () => {
	render(() => <Input label="Search" leadingIconName="search" />);
	expect(screen.getByText("search")).toBeInTheDocument();
});

test("forwards ref to the underlying input", () => {
	let element: HTMLInputElement | undefined;
	render(() => <Input label="Q" ref={(node) => (element = node)} />);
	expect(element).toBe(screen.getByRole("textbox"));
});

test("rootRef is the whole field around the input", () => {
	let root: HTMLDivElement | undefined;
	render(() => (
		<Input
			label="Q"
			rootRef={(node) => {
				root = node;
			}}
		/>
	));
	const input = screen.getByRole("textbox");
	expect(root).toBeInstanceOf(HTMLDivElement);
	expect(root).not.toBe(input.parentElement);
	expect(root?.contains(input)).toBe(true);
	expect(root?.contains(screen.getByText("Q"))).toBe(true);
});

test("clicking the wrapper focuses the input", () => {
	render(() => <Input label="Q" />);
	const input = screen.getByRole("textbox");
	fireEvent.click(input.parentElement!);
	expect(document.activeElement).toBe(input);
});
