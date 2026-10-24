// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { For, type JSX } from "solid-js";
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

function options(): JSX.Element {
	return (
		<For each={items}>
			{(item) => (
				<Combobox.Option value={item.value}>
					{item.label}
				</Combobox.Option>
			)}
		</For>
	);
}

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

/** The rendered option rows' text. A highlighted match splits a label across
 *  a `<mark>` and its siblings, so this reads `textContent`. */
function optionLabels(): (string | null)[] {
	return screen.queryAllByRole("option").map((option) => option.textContent);
}

function control(): HTMLElement {
	const element = document.querySelector<HTMLElement>(
		'[data-scope="combobox"][data-part="control"]'
	);
	if (!element) throw new Error("No combobox control rendered.");
	return element;
}

describe("Combobox", () => {
	test("typing narrows the rendered options to the match", async () => {
		render(() => <Combobox.Root label="Topic">{options()}</Combobox.Root>);
		open();
		await type("health");
		expect(optionLabels()).toEqual(["Healthcare"]);
	});

	test("picking an option resets the filter, so reopening lists every option", async () => {
		render(() => <Combobox.Root label="Topic">{options()}</Combobox.Root>);
		open();
		await type("health");
		fireEvent.click(screen.getByRole("option", { name: "Healthcare" }));
		await waitFor(() => {
			expect(screen.getByRole("combobox")).toHaveAttribute(
				"aria-expanded",
				"false"
			);
		});
		open();
		await waitFor(() => {
			expect(screen.getAllByRole("option")).toHaveLength(items.length);
		});
	});

	// jsdom never fires zag's outside press, so this passes with or without
	// keepOpenOnPressIn; the optionCollection unit test guards that fix.
	test("pressing the field's own control while open keeps the list open", async () => {
		const onOpenChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Topic"
				onOpenChange={(details) => {
					onOpenChange(details.open);
				}}
			>
				{options()}
			</Combobox.Root>
		));
		open();
		await screen.findByRole("listbox");
		onOpenChange.mockClear();
		const point = { clientX: 500, clientY: 500 };
		fireEvent.pointerDown(control(), { ...point, pointerType: "mouse" });
		fireEvent.pointerUp(control(), point);
		fireEvent.click(control(), point);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(screen.getByRole("combobox")).toHaveAttribute(
			"aria-expanded",
			"true"
		);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("Backspace in an empty input removes the last chip's value", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Topic"
				multiple
				value={["fin", "health"]}
				onValueChange={onValueChange}
			>
				{options()}
			</Combobox.Root>
		));
		fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: ["fin"] })
			);
		});
	});

	test("OptionText is the label filtering matches; the description is not", async () => {
		render(() => (
			<Combobox.Root label="Topic">
				<Combobox.Option value="health">
					<Combobox.OptionText>Healthcare</Combobox.OptionText>
					<Combobox.OptionDescription>
						Hospitals
					</Combobox.OptionDescription>
				</Combobox.Option>
			</Combobox.Root>
		));
		open();
		await type("hosp");
		expect(optionLabels()).toEqual([]);
		await type("care");
		expect(optionLabels()).toEqual(["HealthcareHospitals"]);
	});

	test("a filter prop replaces the label match", async () => {
		render(() => (
			<Combobox.Root
				label="Topic"
				filter={(input, option) => option.value.startsWith(input)}
			>
				{options()}
			</Combobox.Root>
		));
		open();
		await type("sa");
		expect(optionLabels()).toEqual(["SaaS"]);
	});

	test("a Combobox.Empty child replaces the empty text", async () => {
		render(() => (
			<Combobox.Root label="Topic">
				{options()}
				<Combobox.Empty>None</Combobox.Empty>
			</Combobox.Root>
		));
		open();
		await type("zzz");
		expect(screen.getByText("None")).toBeInTheDocument();
		expect(optionLabels()).toEqual([]);
	});

	test("shows a default empty text when nothing matches", async () => {
		render(() => <Combobox.Root label="Topic">{options()}</Combobox.Root>);
		open();
		await type("zzz");
		expect(screen.getByText("No results found")).toBeInTheDocument();
	});

	test("multiple selection shows a chip per selected option, by label", () => {
		render(() => (
			<Combobox.Root label="Topic" multiple value={["fin", "health"]}>
				{options()}
			</Combobox.Root>
		));
		expect(
			screen.getByRole("button", { name: "Remove Fintech" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove Healthcare" })
		).toBeInTheDocument();
	});

	test("Combobox.SelectedOptions renders the chips in the control", () => {
		render(() => (
			<Combobox.Root label="Topic" value={["fin"]}>
				<Combobox.SelectedOptions />
				{options()}
			</Combobox.Root>
		));
		expect(control()).toContainElement(
			screen.getByRole("button", { name: "Remove Fintech" })
		);
	});

	test("removing a chip drops just that value", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Combobox.Root
				label="Topic"
				multiple
				value={["fin", "health"]}
				onValueChange={onValueChange}
			>
				{options()}
			</Combobox.Root>
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
				label="Topic"
				allowClearing
				value={["fin"]}
				onValueChange={onValueChange}
			>
				{options()}
			</Combobox.Root>
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
			<Combobox.Root label="Topic" value={["fin"]}>
				{options()}
			</Combobox.Root>
		));
		expect(
			screen.queryByRole("button", { name: "Clear value" })
		).toBeNull();
	});

	test("the consumer's positioning reaches the list", async () => {
		render(() => (
			<Combobox.Root
				label="Topic"
				positioning={{ sameWidth: false, strategy: "fixed" }}
			>
				{options()}
			</Combobox.Root>
		));
		open();
		await screen.findByRole("listbox");
		const positioner = document.querySelector<HTMLElement>(
			'[data-scope="combobox"][data-part="positioner"]'
		);
		expect(positioner?.style.width).toBe("");
		expect(positioner?.style.position).toBe("fixed");
	});

	test("options are rows of a listbox, not ul/li list items", async () => {
		render(() => <Combobox.Root label="Topic">{options()}</Combobox.Root>);
		open();
		const listbox = await screen.findByRole("listbox");
		expect(listbox.querySelector("ul, li")).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
	});
});
