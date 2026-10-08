import { fireEvent, render, screen } from "@solidjs/testing-library";

import { Input } from "./Input.tsx";

test("calls onValueChange on input", () => {
	let v = "";
	render(() => (
		<Input label="Q" onValueChange={(e) => (v = e.currentTarget.value)} />
	));
	fireEvent.input(screen.getByRole("textbox"), { target: { value: "hi" } });
	expect(v).toBe("hi");
});

test("merges onValueChange with onInput", () => {
	let fromInput = "";
	let fromValue = "";
	render(() => (
		<Input
			label="Q"
			onInput={(e) => (fromInput = e.currentTarget.value)}
			onValueChange={(e) => (fromValue = e.currentTarget.value)}
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
	let el: HTMLInputElement | undefined;
	render(() => <Input label="Q" ref={(node) => (el = node)} />);
	expect(el).toBe(screen.getByRole("textbox"));
});

test("clicking the wrapper focuses the input", () => {
	render(() => <Input label="Q" />);
	const input = screen.getByRole("textbox");
	fireEvent.click(input.parentElement!);
	expect(document.activeElement).toBe(input);
});
