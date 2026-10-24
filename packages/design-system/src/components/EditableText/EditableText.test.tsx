import { fireEvent, render, screen } from "@solidjs/testing-library";

import { EditableText } from "./EditableText.tsx";

test("the single-line field is named by its label", () => {
	render(() => <EditableText label="Title" value="" onCommit={() => {}} />);
	expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
});

test("the multiline field is named by its label", () => {
	render(() => (
		<EditableText multiline label="Notes" value="" onCommit={() => {}} />
	));
	expect(screen.getByRole("textbox", { name: "Notes" }).tagName).toBe(
		"TEXTAREA"
	);
});

test("the label is visually hidden but kept", () => {
	render(() => <EditableText label="Title" value="" onCommit={() => {}} />);
	expect(screen.getByText("Title")).toHaveAttribute("data-hidden");
});

test("single-line field carries maxLength", () => {
	render(() => (
		<EditableText label="Q" value="" maxLength={5} onCommit={() => {}} />
	));
	expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "5");
});

test("multiline field carries maxLength", () => {
	render(() => (
		<EditableText
			multiline
			label="Q"
			value=""
			maxLength={5}
			onCommit={() => {}}
		/>
	));
	const element = screen.getByRole("textbox");
	expect(element.tagName).toBe("TEXTAREA");
	expect(element).toHaveAttribute("maxlength", "5");
});

test("commits on blur only when the value changed", () => {
	const onCommit = vi.fn();
	render(() => <EditableText label="Q" value="a" onCommit={onCommit} />);
	const input = screen.getByRole("textbox");
	fireEvent.blur(input);
	expect(onCommit).not.toHaveBeenCalled();
	fireEvent.input(input, { target: { value: "ab" } });
	fireEvent.blur(input);
	expect(onCommit).toHaveBeenCalledTimes(1);
	expect(onCommit).toHaveBeenCalledWith("ab");
});
