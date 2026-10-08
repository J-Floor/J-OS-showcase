// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, test, vi } from "vitest";

import { Combobox } from "./Combobox.tsx";

// jsdom workaround: ark/zag Combobox calls `scrollContentToTop` -> element.scrollTo
// when the listbox opens, but jsdom doesn't implement Element.prototype.scrollTo.
// Without this stub the state machine throws mid-transition (see Select.test.tsx).
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}

const items = [
	{ value: "fin", label: "Fintech" },
	{ value: "health", label: "Healthcare" },
	{ value: "saas", label: "SaaS" },
];

function open(): void {
	fireEvent.click(screen.getByRole("combobox"));
}

/**
 * Types into the input and waits a tick. zag processes the `input` event on
 * its own queue, so `onInputValueChange` — and therefore our filtering —
 * lands a tick after `fireEvent` returns; a synchronous assertion right after
 * would read the unfiltered list (same timing note as CommandPalette.test.tsx).
 */
async function type(value: string): Promise<void> {
	fireEvent.input(screen.getByRole("combobox"), { target: { value } });
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The rendered option labels. Read off `[data-part="item-text"]` rather than
 * `getByText`: a highlighted match splits the label across a `<mark>` and its
 * siblings, so "Healthcare" is more than one text node once "health" has been
 * typed (the same issue CommandPalette.test.tsx documents and works around).
 */
function optionLabels(): (string | null)[] {
	return Array.from(document.querySelectorAll('[data-part="item-text"]')).map(
		(el) => el.textContent
	);
}

describe("Combobox", () => {
	test("typing narrows the rendered options to the match", async () => {
		render(() => <Combobox.Root label="Vertical" items={items} />);
		open();
		await type("health");
		expect(optionLabels()).toEqual(["Healthcare"]);
	});

	test("shows the empty text when nothing matches", async () => {
		render(() => (
			<Combobox.Root label="Vertical" items={items} emptyText="None" />
		));
		open();
		await type("zzz");
		expect(screen.getByText("None")).toBeInTheDocument();
		expect(optionLabels()).toEqual([]);
	});

	test("multiple selection surfaces a chip per selected item", () => {
		render(() => (
			<Combobox.Root
				label="Vertical"
				items={items}
				multiple
				value={["fin", "health"]}
			/>
		));
		expect(screen.getAllByText("Fintech").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Healthcare").length).toBeGreaterThan(0);
	});

	test("removing a chip drops just that value", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Vertical"
				items={items}
				multiple
				value={["fin", "health"]}
				onValueChange={onValueChange}
			/>
		));
		fireEvent.click(screen.getByRole("button", { name: "Remove Fintech" }));
		// zag commits the value asynchronously, same as Select's ITEM.CLICK.
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: ["health"] })
			);
		});
	});

	test("the clear control empties the value when allowClearing is set", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Vertical"
				items={items}
				allowClearing
				value={["fin"]}
				onValueChange={onValueChange}
			/>
		));
		fireEvent.click(screen.getByRole("button", { name: "Clear value" }));
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: [] })
			);
		});
	});

	test("no clear control when allowClearing is left unset", () => {
		render(() => (
			<Combobox.Root label="Vertical" items={items} value={["fin"]} />
		));
		expect(
			screen.queryByRole("button", { name: "Clear value" })
		).toBeNull();
	});

	test("fires onValueChange when an option is chosen", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Vertical"
				items={items}
				onValueChange={onValueChange}
			/>
		));
		open();
		fireEvent.click(await screen.findByText("SaaS"));
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalled();
		});
	});
});
