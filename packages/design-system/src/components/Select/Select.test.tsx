import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, For } from "solid-js";
import { describe, expect, test, vi } from "vitest";

import { Select } from "./Select.tsx";

// jsdom workaround: ark/zag Select calls `scrollContentToTop` -> element.scrollTo
// when the listbox opens, but jsdom doesn't implement Element.prototype.scrollTo.
// Without this stub the state machine throws mid-transition and never commits the
// selected value.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}

function trigger(): HTMLElement {
	return screen.getByRole("combobox");
}

/** Opens the list and waits for zag to commit the open state. */
async function open(): Promise<void> {
	fireEvent.click(trigger());
	await screen.findByRole("listbox");
}

const FRAME_MS = 50;
/** Away from the list's (zero, jsdom) box, so zag reads the press as outside it. */
const OUTSIDE_POINT = 500;

/** zag starts listening for outside presses a timeout after the list opens. */
async function settleOutsideTracking(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
}

/** A mouse press on `element`: pointerdown, then the click it ends in. */
function pressOutsideTheList(element: HTMLElement): void {
	const point = { clientX: OUTSIDE_POINT, clientY: OUTSIDE_POINT };
	fireEvent.pointerDown(element, { ...point, pointerType: "mouse" });
	fireEvent.pointerUp(element, point);
	fireEvent.click(element, point);
}

function optionLabels(): (string | null)[] {
	return screen.getAllByRole("option").map((option) => option.textContent);
}

describe("Select", () => {
	test("children options render, and picking one reports its value", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Select.Root label="Plan" onValueChange={onValueChange}>
				<Select.Option value="basic">Basic</Select.Option>
				<Select.Option value="pro">Pro</Select.Option>
			</Select.Root>
		));
		await open();
		expect(optionLabels()).toEqual(["Basic", "Pro"]);
		fireEvent.click(screen.getByRole("option", { name: "Pro" }));
		// zag commits the value asynchronously after the ITEM.CLICK transition.
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: ["pro"] })
			);
		});
	});

	test("a <For> over options keeps the collection in step with its data", async () => {
		const [rows, setRows] = createSignal([
			{ id: "a", name: "Alpha" },
			{ id: "b", name: "Beta" },
		]);
		const onValueChange = vi.fn();
		render(() => (
			<Select.Root label="Letter" onValueChange={onValueChange}>
				<For each={rows()}>
					{(row) => (
						<Select.Option value={row.id}>{row.name}</Select.Option>
					)}
				</For>
			</Select.Root>
		));
		setRows([
			{ id: "c", name: "Gamma" },
			{ id: "a", name: "Alpha" },
		]);
		await open();
		expect(optionLabels()).toEqual(["Gamma", "Alpha"]);
		fireEvent.click(screen.getByRole("option", { name: "Gamma" }));
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: ["c"] })
			);
		});
	});

	test("a disabled option reaches the collection as disabled", async () => {
		render(() => (
			<Select.Root label="Plan">
				<Select.Option value="basic" disabled>
					Basic
				</Select.Option>
				<Select.Option value="pro">Pro</Select.Option>
			</Select.Root>
		));
		await open();
		expect(screen.getByRole("option", { name: "Basic" })).toHaveAttribute(
			"data-disabled"
		);
		expect(screen.getByRole("option", { name: "Pro" })).not.toHaveAttribute(
			"data-disabled"
		);
	});

	// jsdom never fires zag's outside press, so this passes with or without
	// keepOpenOnPressIn; the optionCollection unit test guards that fix.
	test("pressing the chevron while open closes the list once", async () => {
		const onOpenChange = vi.fn();
		render(() => (
			<Select.Root
				label="Plan"
				onOpenChange={(details) => {
					onOpenChange(details.open);
				}}
			>
				<Select.Option value="basic">Basic</Select.Option>
			</Select.Root>
		));
		await open();
		onOpenChange.mockClear();
		const chevron = document.querySelector<HTMLElement>(
			'[data-scope="select"][data-part="indicator"]'
		);
		if (!chevron) throw new Error("No chevron rendered.");
		await settleOutsideTracking();
		pressOutsideTheList(chevron);
		await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
		await waitFor(() => {
			expect(trigger()).toHaveAttribute("aria-expanded", "false");
		});
		expect(onOpenChange.mock.calls).toEqual([[false]]);
	});

	test("typeahead on the closed trigger matches the option labels", async () => {
		const onValueChange = vi.fn();
		render(() => (
			<Select.Root label="Plan" onValueChange={onValueChange}>
				<Select.Option value="t1">Basic</Select.Option>
				<Select.Option value="t2">Pro</Select.Option>
			</Select.Root>
		));
		trigger().focus();
		fireEvent.keyDown(trigger(), { key: "p" });
		await waitFor(() => {
			expect(onValueChange).toHaveBeenCalledWith(
				expect.objectContaining({ value: ["t2"] })
			);
		});
	});

	test("the trigger shows the OptionText label, not the description", () => {
		render(() => (
			<Select.Root label="Plan" value={["basic"]}>
				<Select.Option value="basic">
					<Select.OptionText>Basic</Select.OptionText>
					<Select.OptionDescription>
						Fewer features
					</Select.OptionDescription>
				</Select.Option>
			</Select.Root>
		));
		expect(trigger()).toHaveTextContent(/^Basic$/);
	});

	test("the consumer's positioning reaches the list", async () => {
		render(() => (
			<Select.Root
				label="Plan"
				positioning={{ sameWidth: true, strategy: "fixed" }}
			>
				<Select.Option value="basic">Basic</Select.Option>
			</Select.Root>
		));
		await open();
		const positioner = document.querySelector<HTMLElement>(
			'[data-scope="select"][data-part="positioner"]'
		);
		expect(positioner?.style.width).toBe("var(--reference-width)");
		expect(positioner?.style.position).toBe("fixed");
	});

	test("the clear button sits beside the trigger, not inside it", () => {
		render(() => (
			<Select.Root label="Plan" value={["basic"]} allowClearing>
				<Select.Option value="basic">Basic</Select.Option>
			</Select.Root>
		));
		const clear = screen.getByRole("button", { name: "Clear value" });
		expect(
			clear.closest('[data-scope="select"][data-part="trigger"]')
		).toBeNull();
		expect(trigger().querySelector("button")).toBeNull();
	});

	test("clicking the label opens the list", async () => {
		render(() => (
			<Select.Root label="Plan">
				<Select.Option value="basic">Basic</Select.Option>
			</Select.Root>
		));
		fireEvent.click(screen.getByText("Plan"));
		await waitFor(() => {
			expect(trigger()).toHaveAttribute("aria-expanded", "true");
		});
	});

	test("a hidden select carries the value into a form", () => {
		const { container } = render(() => (
			<form>
				<Select.Root label="Plan" name="plan" value={["pro"]}>
					<Select.Option value="basic">Basic</Select.Option>
					<Select.Option value="pro">Pro</Select.Option>
				</Select.Root>
			</form>
		));
		const form = container.querySelector("form");
		expect(form && new FormData(form).get("plan")).toBe("pro");
	});

	test("multiple shows each selection as a chip in the control", () => {
		render(() => (
			<Select.Root label="Plan" multiple value={["basic", "pro"]}>
				<Select.Option value="basic">Basic</Select.Option>
				<Select.Option value="pro">Pro</Select.Option>
			</Select.Root>
		));
		expect(
			screen.getByRole("button", { name: "Remove Basic" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Remove Pro" })
		).toBeInTheDocument();
	});

	test("options are rows of a listbox, not ul/li list items", async () => {
		render(() => (
			<Select.Root label="Plan">
				<Select.Option value="basic">Basic</Select.Option>
			</Select.Root>
		));
		await open();
		const listbox = screen.getByRole("listbox");
		expect(listbox.querySelector("ul, li")).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
		expect(screen.queryByRole("list")).toBeNull();
	});

	test("a group renders its label part over its options", async () => {
		render(() => (
			<Select.Root label="Plan">
				<Select.OptionsGroup>
					<Select.OptionsGroupLabel>Plans</Select.OptionsGroupLabel>
					<Select.Option value="basic">Basic</Select.Option>
				</Select.OptionsGroup>
			</Select.Root>
		));
		await open();
		expect(screen.getByRole("group", { name: "Plans" })).toContainElement(
			screen.getByRole("option", { name: "Basic" })
		);
	});
});
