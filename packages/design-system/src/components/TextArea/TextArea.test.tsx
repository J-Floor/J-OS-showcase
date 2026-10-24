import { fireEvent, render, screen } from "@solidjs/testing-library";

import { TextArea } from "./TextArea.tsx";

test("onInput receives the text, not the event", () => {
	let value: string | undefined;
	render(() => <TextArea label="Notes" onInput={(next) => (value = next)} />);
	fireEvent.input(screen.getByRole("textbox"), {
		target: { value: "hello" },
	});
	expect(value).toBe("hello");
});

test("the label names the textarea", () => {
	render(() => <TextArea label="Notes" onInput={() => {}} />);
	expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
});

test("textarea attributes reach the textarea", () => {
	render(() => (
		<TextArea
			label="Notes"
			placeholder="Add a note"
			maxLength={5}
			readOnly
			onInput={() => {}}
		/>
	));
	const textarea = screen.getByRole("textbox");
	expect(textarea.tagName).toBe("TEXTAREA");
	expect(textarea).toHaveAttribute("placeholder", "Add a note");
	expect(textarea).toHaveAttribute("maxlength", "5");
	expect(textarea).toHaveAttribute("readonly");
});

test("invalid marks the textarea and shows the error text", () => {
	render(() => (
		<TextArea
			label="Notes"
			invalid
			errorText="Too short"
			onInput={() => {}}
		/>
	));
	expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
	expect(screen.getByText("Too short")).toBeInTheDocument();
});

test("helper text stays off the textarea's attributes", () => {
	const { container } = render(() => (
		<TextArea
			label="Notes"
			helperText="Markdown works"
			onInput={() => {}}
		/>
	));
	expect(screen.getByText("Markdown works")).toBeInTheDocument();
	expect(container.querySelector("textarea[helpertext]")).toBeNull();
});
