import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

import { Select } from "./Select.tsx";

// jsdom workaround: ark/zag Select calls `scrollContentToTop` -> element.scrollTo
// when the listbox opens, but jsdom doesn't implement Element.prototype.scrollTo.
// Without this stub the state machine throws mid-transition and never commits the
// selected value.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}

const opts = [
	{ value: "a", title: "Alpha" },
	{ value: "b", title: "Beta" },
];

test("opens and selects an option", async () => {
	let val: string[] = [];
	render(() => (
		<Select.Root
			label="X"
			options={opts}
			onValueChange={(d) => (val = d.value)}
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
		expect(val).toEqual(["b"]);
	});
});
