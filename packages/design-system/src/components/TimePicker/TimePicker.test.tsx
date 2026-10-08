import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import { TimePicker } from "./TimePicker.tsx";

function segment(container: HTMLElement, type: "hour" | "minute"): HTMLElement {
	const el = container.querySelector<HTMLElement>(`[data-type="${type}"]`);
	if (!el) throw new Error(`segment "${type}" not found`);
	return el;
}

/**
 * Simulate a user adjusting a segment's value, like arrowing a spinbutton.
 * Uses a real `.focus()` call (not `fireEvent.focus`, which dispatches a
 * synthetic focus event without moving `document.activeElement`) — the
 * date-input machine resolves the active segment off real DOM focus.
 */
function adjust(el: HTMLElement, key: "ArrowUp" | "ArrowDown" = "ArrowUp") {
	el.focus();
	fireEvent.keyDown(el, { key });
}

test("renders exactly the hour and minute editable segments", () => {
	const { container } = render(() => <TimePicker label="Start" />);
	const editable = container.querySelectorAll(
		'[data-part="segment"][data-editable]'
	);
	expect(editable).toHaveLength(2);
	expect(segment(container, "hour")).toBeInTheDocument();
	expect(segment(container, "minute")).toBeInTheDocument();
});

test("renders the label and the schedule icon", () => {
	render(() => <TimePicker label="Start" />);
	expect(screen.getByText("Start")).toBeInTheDocument();
	expect(screen.getByText("schedule")).toBeInTheDocument();
});

test("a controlled value renders the matching segment values", () => {
	const { container } = render(() => (
		<TimePicker label="Start" value="14:05" />
	));
	expect(segment(container, "hour")).toHaveAttribute("data-value", "14");
	expect(segment(container, "minute")).toHaveAttribute("data-value", "5");
});

test("building a time by adjusting both segments fires onValueChange with an HH:MM string", async () => {
	let value: string | null | undefined;
	const { container } = render(() => (
		<TimePicker label="Start" onValueChange={(v) => (value = v)} />
	));

	// Neither segment has a value yet — adjusting one alone must not commit.
	adjust(segment(container, "hour"));
	await waitFor(() => {
		expect(segment(container, "hour")).not.toHaveAttribute(
			"data-placeholder-shown"
		);
	});
	expect(value).toBeUndefined();

	// Once both segments have a value, the field commits.
	adjust(segment(container, "minute"));
	await waitFor(() => {
		expect(value).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
	});
});

test("clearing every segment fires onValueChange with null", async () => {
	let value: string | null | undefined;
	const { container } = render(() => (
		<TimePicker
			label="Start"
			value="09:30"
			onValueChange={(v) => (value = v)}
		/>
	));

	segment(container, "hour").focus();
	fireEvent.keyDown(segment(container, "hour"), { key: "Backspace" });
	await waitFor(() => {
		expect(segment(container, "hour")).toHaveAttribute(
			"data-placeholder-shown"
		);
	});
	// Backspace on a 2-digit segment peels off one digit at a time (unlike the
	// hour segment, which clears fully in one press) — two presses to empty it.
	segment(container, "minute").focus();
	fireEvent.keyDown(segment(container, "minute"), { key: "Backspace" });
	fireEvent.keyDown(segment(container, "minute"), { key: "Backspace" });

	await waitFor(() => {
		expect(value).toBeNull();
	});
});

test("a value outside minTime/maxTime marks the field invalid instead of being clamped", () => {
	const { container } = render(() => (
		<TimePicker
			label="Start"
			value="20:00"
			minTime="09:00"
			maxTime="18:00"
		/>
	));
	// The out-of-window value is still shown (not clamped) …
	expect(segment(container, "hour")).toHaveAttribute("data-value", "20");
	// … and the field reports itself invalid via an error message.
	const errorText = container.querySelector('[data-part="error-text"]');
	expect(errorText).toHaveTextContent(/./);
});

test("typing an out-of-window time against a static controlled value marks the field invalid", async () => {
	// Regression guard: for a controlled instance the ark machine's own
	// `value` stays pinned to the (unchanging) `value` prop, so an in-progress
	// out-of-range edit — deliberately never propagated back — must still be
	// visible via TimePicker's own attempted-value tracking, not just via
	// `dateInput().value`.
	const { container } = render(() => (
		<TimePicker label="Start" value="12:00" minTime="09:00" />
	));

	adjust(segment(container, "hour"), "ArrowDown"); // 12 -> 11, still in range
	adjust(segment(container, "hour"), "ArrowDown");
	adjust(segment(container, "hour"), "ArrowDown");
	adjust(segment(container, "hour"), "ArrowDown"); // 08:00 — now out of range

	await waitFor(() => {
		expect(
			container.querySelector('[data-part="error-text"]')
		).toHaveTextContent(/./);
	});
});

test("a value inside minTime/maxTime is not marked invalid", () => {
	const { container } = render(() => (
		<TimePicker
			label="Start"
			value="12:00"
			minTime="09:00"
			maxTime="18:00"
		/>
	));
	expect(
		container.querySelector('[data-part="error-text"]')
	).not.toBeInTheDocument();
});

test("a custom errorText overrides the default out-of-range message", () => {
	const { container } = render(() => (
		<TimePicker
			label="Start"
			value="20:00"
			maxTime="18:00"
			errorText="Too late"
		/>
	));
	expect(
		container.querySelector('[data-part="error-text"]')
	).toHaveTextContent("Too late");
});
