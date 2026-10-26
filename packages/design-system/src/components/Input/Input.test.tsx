import { fireEvent, render, screen } from "@solidjs/testing-library";
import { vi } from "vitest";

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

test("a click on the leading icon focuses the input and clicks it once", () => {
	const onClick = vi.fn();
	render(() => (
		<Input label="Q" leadingIconName="search" onClick={onClick} />
	));
	fireEvent.click(screen.getByText("search"));
	expect(screen.getByRole("textbox")).toHaveFocus();
	expect(onClick).toHaveBeenCalledTimes(1);
});

test("a click on static trailing content focuses the input and clicks it once", () => {
	const onClick = vi.fn();
	render(() => (
		<Input
			label="Q"
			onClick={onClick}
			trailing={<span data-testid="hint">K</span>}
		/>
	));
	fireEvent.click(screen.getByTestId("hint"));
	expect(screen.getByRole("textbox")).toHaveFocus();
	expect(onClick).toHaveBeenCalledTimes(1);
});

test("a click on the input itself runs its click handler once", () => {
	const onClick = vi.fn();
	render(() => <Input label="Q" onClick={onClick} />);
	fireEvent.click(screen.getByRole("textbox"));
	expect(onClick).toHaveBeenCalledTimes(1);
});

test("a click on a button in the trailing slot leaves the input alone", () => {
	const onClick = vi.fn();
	render(() => (
		<Input label="Q" onClick={onClick} trailing={<button>x</button>} />
	));
	fireEvent.click(screen.getByRole("button", { name: "x" }));
	expect(screen.getByRole("textbox")).not.toHaveFocus();
	expect(onClick).not.toHaveBeenCalled();
});
