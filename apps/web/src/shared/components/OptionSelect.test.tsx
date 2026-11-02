// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { OptionSelect } from "./OptionSelect.tsx";

afterEach(cleanup);

const OPTIONS = [
	{ value: "a", label: "Alpha" },
	{ value: "b", label: "Beta" },
] as const;

async function pick(option: string): Promise<void> {
	fireEvent.click(screen.getByRole("combobox", { name: "Letter" }));
	fireEvent.click(await screen.findByRole("option", { name: option }));
}

test("shows the placeholder with no value", () => {
	render(() => (
		<OptionSelect
			label="Letter"
			placeholder="Pick one"
			options={OPTIONS}
			value={undefined}
			onChange={() => {}}
		/>
	));
	expect(screen.getByRole("combobox", { name: "Letter" })).toHaveTextContent(
		"Pick one"
	);
});

test("a new pick sends the value", async () => {
	const onChange = vi.fn();
	render(() => (
		<OptionSelect
			label="Letter"
			options={OPTIONS}
			value="a"
			onChange={onChange}
		/>
	));
	await pick("Beta");
	expect(onChange).toHaveBeenCalledExactlyOnceWith("b");
});

test("picking the current value again sends nothing", async () => {
	const onChange = vi.fn();
	render(() => (
		<OptionSelect
			label="Letter"
			options={OPTIONS}
			value="a"
			onChange={onChange}
		/>
	));
	await pick("Alpha");
	expect(onChange).not.toHaveBeenCalled();
});

test("a clearable select sends undefined when emptied", async () => {
	const onChange = vi.fn();
	render(() => (
		<OptionSelect
			label="Letter"
			options={OPTIONS}
			value="a"
			clearable
			onChange={onChange}
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: /clear/i }));
	await waitFor(() => {
		expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
	});
});

test("a select that is not clearable has no clear control", () => {
	render(() => (
		<OptionSelect
			label="Letter"
			options={OPTIONS}
			value="a"
			onChange={() => {}}
		/>
	));
	expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
});
