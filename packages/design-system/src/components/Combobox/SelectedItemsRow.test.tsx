// @vitest-environment jsdom
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, test, vi } from "vitest";

import { SelectedItemsRow } from "./SelectedItemsRow.tsx";

const items = [
	{ value: "fin", label: "Fintech" },
	{ value: "health", label: "Health" },
];

describe("SelectedItemsRow", () => {
	test("renders a chip per item when it cannot measure (jsdom)", () => {
		render(() => (
			<SelectedItemsRow
				items={items}
				getValue={(i) => i.value}
				getLabel={(i) => i.label}
				onRemove={() => {}}
			/>
		));
		// visible chips (the hidden measure copy is aria-hidden)
		expect(screen.getAllByText("Fintech").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Health").length).toBeGreaterThan(0);
	});

	test("renders nothing when empty", () => {
		const { container } = render(() => (
			<SelectedItemsRow
				items={[]}
				getValue={(i: { value: string }) => i.value}
				getLabel={() => ""}
				onRemove={() => {}}
			/>
		));
		expect(container.textContent).toBe("");
	});

	test("remove button fires onRemove with the value", () => {
		const onRemove = vi.fn();
		render(() => (
			<SelectedItemsRow
				items={items}
				getValue={(i) => i.value}
				getLabel={(i) => i.label}
				onRemove={onRemove}
			/>
		));
		fireEvent.click(screen.getAllByRole("button")[0]);
		expect(onRemove).toHaveBeenCalledWith("fin");
	});
});
