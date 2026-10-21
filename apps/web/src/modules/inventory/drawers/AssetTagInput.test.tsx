// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { AssetTagInput } from "./AssetTagInput.tsx";

afterEach(cleanup);

const INCOMPLETE_ERROR = "Enter one letter and five digits.";

function renderInput(initial = "", hasError = false) {
	const onFlush = vi.fn();
	const changes: string[] = [];
	render(() => {
		const [value, setValue] = createSignal(initial);
		return (
			<AssetTagInput
				value={value()}
				onChange={(tag) => {
					changes.push(tag);
					setValue(tag);
				}}
				onFlush={onFlush}
				hasError={hasError}
			/>
		);
	});
	return {
		changes,
		onFlush,
		letter: () => screen.getByLabelText("Asset tag letter"),
		number: () => screen.getByLabelText("Asset tag number"),
	};
}

test("is one labelled group of two named fields", () => {
	const { number } = renderInput();
	expect(
		screen.getByRole("group", { name: "Asset tag" })
	).toBeInTheDocument();
	expect(number()).toHaveAttribute("inputmode", "numeric");
	expect(
		screen.getByText("One letter and five digits, e.g. A00000")
	).toBeInTheDocument();
});

test("a typed letter is uppercased and moves focus to the number", () => {
	const { letter, number, changes } = renderInput();
	fireEvent.input(letter(), { target: { value: "a" } });
	expect(letter()).toHaveValue("A");
	expect(number()).toHaveFocus();
	expect(changes.at(-1)).toBe("A");
});

test("a non-letter is dropped from the letter field and focus stays", () => {
	const { letter, number } = renderInput();
	letter().focus();
	fireEvent.input(letter(), { target: { value: "5" } });
	expect(letter()).toHaveValue("");
	expect(number()).not.toHaveFocus();
});

test("non-digits are dropped from the number field and a 6th digit is cut", () => {
	const { number, changes } = renderInput("A");
	fireEvent.input(number(), { target: { value: "12x3" } });
	expect(number()).toHaveValue("123");
	fireEvent.input(number(), { target: { value: "123456" } });
	expect(number()).toHaveValue("12345");
	expect(changes.at(-1)).toBe("A12345");
});

test("Backspace in an empty number field moves focus back to the letter", () => {
	const { letter, number } = renderInput("A");
	number().focus();
	fireEvent.keyDown(number(), { key: "Backspace" });
	expect(letter()).toHaveFocus();
});

test("Backspace in a filled number field stays put", () => {
	const { letter, number } = renderInput("A12");
	number().focus();
	fireEvent.keyDown(number(), { key: "Backspace" });
	expect(letter()).not.toHaveFocus();
});

test("pasting a full tag fills both fields", () => {
	const { letter, number, changes } = renderInput();
	fireEvent.paste(letter(), {
		clipboardData: { getData: () => " a00012 " },
	});
	expect(letter()).toHaveValue("A");
	expect(number()).toHaveValue("00012");
	expect(changes.at(-1)).toBe("A00012");
});

test("pasting a digit run into the number field fills it, cut to 5", () => {
	const { number, changes } = renderInput("B");
	fireEvent.paste(number(), { clipboardData: { getData: () => "1234567" } });
	expect(number()).toHaveValue("12345");
	expect(changes.at(-1)).toBe("B12345");
});

test("a pre-filled tag splits into the two fields", () => {
	const { letter, number } = renderInput("A00001");
	expect(letter()).toHaveValue("A");
	expect(number()).toHaveValue("00001");
});

test("a pre-filled value that is not a tag never forms a valid tag", () => {
	const { letter, number, changes } = renderInput("not-a-tag");
	expect(changes).toEqual([]);
	const combined =
		(letter() as HTMLInputElement).value +
		(number() as HTMLInputElement).value;
	expect(combined).not.toMatch(/^[A-Z]\d{5}$/);
});

test("leaving the group incomplete says what to enter, and flushes", () => {
	const { letter, onFlush } = renderInput();
	fireEvent.input(letter(), { target: { value: "a" } });
	expect(screen.queryByText(INCOMPLETE_ERROR)).toBeNull();
	fireEvent.focusOut(letter(), { relatedTarget: document.body });
	expect(screen.getByText(INCOMPLETE_ERROR)).toBeInTheDocument();
	expect(screen.queryByText(/e\.g\. A00000/)).toBeNull();
	expect(letter()).toHaveAttribute("aria-invalid", "true");
	expect(onFlush).toHaveBeenCalled();
});

test("moving between the two fields is not leaving the group", () => {
	const { letter, number } = renderInput("A12");
	fireEvent.focusOut(letter(), { relatedTarget: number() });
	expect(screen.queryByText(INCOMPLETE_ERROR)).toBeNull();
});

test("an empty or complete group shows no error after leaving", () => {
	const { letter } = renderInput();
	fireEvent.focusOut(letter(), { relatedTarget: document.body });
	expect(screen.queryByText(INCOMPLETE_ERROR)).toBeNull();
	cleanup();
	const complete = renderInput("A00001");
	fireEvent.focusOut(complete.letter(), { relatedTarget: document.body });
	expect(screen.queryByText(INCOMPLETE_ERROR)).toBeNull();
});

test("a server failure marks both fields invalid without an incomplete message", () => {
	const { letter, number } = renderInput("A00001", true);
	expect(letter()).toHaveAttribute("aria-invalid", "true");
	expect(number()).toHaveAttribute("aria-invalid", "true");
	expect(screen.queryByText(INCOMPLETE_ERROR)).toBeNull();
});
