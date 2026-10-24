import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { DatePicker } from "./DatePicker.tsx";

const CONTENT = '[data-scope="date-picker"][data-part="content"]';

function content(): HTMLElement | null {
	return document.querySelector<HTMLElement>(CONTENT);
}

function trigger(): HTMLElement {
	const element = document.querySelector<HTMLElement>(
		'[data-scope="date-picker"][data-part="trigger"]'
	);
	if (!element) throw new Error("trigger not found");
	return element;
}

function editableSegmentTypes(container: HTMLElement): (string | null)[] {
	return [
		...container.querySelectorAll('[data-part="segment"][data-editable]'),
	].map((segment) => segment.getAttribute("data-type"));
}

function dayCell(day: number): HTMLElement {
	const cell = [
		...document.querySelectorAll<HTMLElement>(
			'[data-scope="date-picker"][data-part="table-cell-trigger"]'
		),
	].find(
		(element) =>
			element.textContent === String(day) &&
			!element.hasAttribute("data-outside-range")
	);
	if (!cell) throw new Error(`day ${day} not found`);
	return cell;
}

async function open(): Promise<void> {
	fireEvent.click(trigger());
	await waitFor(() => {
		expect(content()).toHaveAttribute("data-state", "open");
	});
}

test("closing keeps the calendar mounted so it can animate out", async () => {
	render(() => <DatePicker label="Due" />);
	await open();
	fireEvent.click(trigger());
	await waitFor(() => {
		expect(content()).toHaveAttribute("data-state", "closed");
	});
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(content()).toHaveAttribute("data-state", "closed");
});

test("renders helper text", () => {
	render(() => <DatePicker label="Due" helperText="Day it is due" />);
	expect(screen.getByText("Day it is due")).toBeInTheDocument();
});

test("renders error text while invalid", () => {
	render(() => <DatePicker label="Due" invalid errorText="Pick a date" />);
	expect(screen.getByText("Pick a date")).toBeInTheDocument();
});

test("defaults to the day-month-year order", () => {
	const { container } = render(() => <DatePicker label="Due" />);
	expect(editableSegmentTypes(container)).toEqual(["day", "month", "year"]);
});

test("a locale changes the segment order", () => {
	const { container } = render(() => (
		<DatePicker label="Due" locale="en-US" />
	));
	expect(editableSegmentTypes(container)).toEqual(["month", "day", "year"]);
});

test("an ISO value fills the segments", () => {
	const { container } = render(() => (
		<DatePicker label="Due" value="2026-03-15" />
	));
	function segment(type: string): Element | null {
		return container.querySelector(
			`[data-part="segment"][data-type="${type}"]`
		);
	}
	expect(segment("day")).toHaveAttribute("data-value", "15");
	expect(segment("month")).toHaveAttribute("data-value", "3");
	expect(segment("year")).toHaveAttribute("data-value", "2026");
});

test("picking a day reports it as an ISO string", async () => {
	let picked: string | null | undefined;
	render(() => (
		<DatePicker
			label="Due"
			value="2026-03-15"
			onValueChange={(next) => (picked = next)}
		/>
	));
	await open();
	fireEvent.click(dayCell(20));
	await waitFor(() => {
		expect(picked).toBe("2026-03-20");
	});
});

test("minIso and maxIso bound the calendar", async () => {
	render(() => (
		<DatePicker
			label="Due"
			value="2026-03-15"
			minIso="2026-03-10"
			maxIso="2026-03-20"
		/>
	));
	await open();
	expect(dayCell(9)).toHaveAttribute("data-disabled");
	expect(dayCell(10)).not.toHaveAttribute("data-disabled");
	expect(dayCell(20)).not.toHaveAttribute("data-disabled");
	expect(dayCell(21)).toHaveAttribute("data-disabled");
});

test("without a value the picker keeps its own selection", async () => {
	render(() => <DatePicker label="Due" />);
	await open();
	fireEvent.click(dayCell(12));
	await waitFor(() => {
		expect(dayCell(12)).toHaveAttribute("data-selected");
	});
});

test("the label names the date segments", () => {
	render(() => <DatePicker label="Due" />);
	expect(screen.getByRole("group", { name: "Due" })).toBeInTheDocument();
});

test("clicking the label focuses the first segment", () => {
	const { container } = render(() => <DatePicker label="Due" />);
	fireEvent.click(screen.getByText("Due"));
	expect(document.activeElement).toBe(
		container.querySelector('[data-part="segment"][data-editable]')
	);
});

test("disabled reaches the calendar trigger", () => {
	render(() => <DatePicker label="Due" disabled disabledReason="Locked" />);
	expect(trigger()).toBeDisabled();
});

test("a controlled value set to null clears the date", async () => {
	const [value, setValue] = createSignal<string | null>("2026-03-15");
	const { container } = render(() => (
		<DatePicker label="Due" value={value()} onValueChange={setValue} />
	));
	function day(): Element | null {
		return container.querySelector(
			'[data-part="segment"][data-type="day"]'
		);
	}
	expect(day()).toHaveAttribute("data-value", "15");
	setValue(null);
	await waitFor(() => {
		expect(day()).toHaveAttribute("data-placeholder-shown");
	});
});

test("classOverride restyles the label", () => {
	render(() => (
		<DatePicker
			label="Due"
			classOverride={{ labelClass: "custom-label" }}
		/>
	));
	expect(screen.getByText("Due")).toHaveClass("custom-label");
});

test("classOverride restyles the calendar content", async () => {
	render(() => (
		<DatePicker
			label="Due"
			classOverride={{ contentClass: "custom-content" }}
		/>
	));
	await open();
	expect(content()).toHaveClass("custom-content");
});
