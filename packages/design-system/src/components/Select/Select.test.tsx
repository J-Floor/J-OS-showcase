import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { Select } from "./Select.tsx";

// jsdom workaround: ark/zag Select calls `scrollContentToTop` -> element.scrollTo
// when the listbox opens, but jsdom doesn't implement Element.prototype.scrollTo.
// Without this stub the state machine throws mid-transition and never commits the
// selected value.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}

const options = [
	{ value: "a", title: "Alpha" },
	{ value: "b", title: "Beta" },
];

test("opens and selects an option", async () => {
	let value: string[] = [];
	render(() => (
		<Select.Root
			label="X"
			options={options}
			onValueChange={(details) => (value = details.value)}
		>
			<Select.Content>
				<Select.Option value="a" title="Alpha" />
				<Select.Option value="b" title="Beta" />
			</Select.Content>
		</Select.Root>
	));
	fireEvent.click(screen.getByRole("combobox"));
	fireEvent.click(await screen.findByText("Beta"));
	// zag commits the value asynchronously after the ITEM.CLICK transition.
	await waitFor(() => {
		expect(value).toEqual(["b"]);
	});
});
