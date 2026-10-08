import { fireEvent, render, screen } from "@solidjs/testing-library";

import { EditableText } from "./EditableText.tsx";

test("single-line field carries maxLength", () => {
	render(() => <EditableText value="" maxLength={5} onCommit={() => {}} />);
	expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "5");
});

test("multiline field carries maxLength", () => {
	render(() => (
		<EditableText multiline value="" maxLength={5} onCommit={() => {}} />
	));
	const el = screen.getByRole("textbox");
	expect(el.tagName).toBe("TEXTAREA");
	expect(el).toHaveAttribute("maxlength", "5");
});

test("commits on blur only when the value changed", () => {
	const onCommit = vi.fn();
	render(() => <EditableText value="a" onCommit={onCommit} />);
	const input = screen.getByRole("textbox");
	fireEvent.blur(input);
	expect(onCommit).not.toHaveBeenCalled();
	fireEvent.input(input, { target: { value: "ab" } });
	fireEvent.blur(input);
	expect(onCommit).toHaveBeenCalledTimes(1);
	expect(onCommit).toHaveBeenCalledWith("ab");
});
