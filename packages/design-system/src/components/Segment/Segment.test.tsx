import { fireEvent, render, screen } from "@solidjs/testing-library";

import { Segment } from "./Segment.tsx";

function radio(value: string): HTMLInputElement {
	const found = screen
		.getAllByRole<HTMLInputElement>("radio")
		.find((input) => input.value === value);
	if (!found) throw new Error(`radio "${value}" not found`);
	return found;
}

test("label names the radiogroup", () => {
	render(() => (
		<Segment.Root label="Match">
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	expect(
		screen.getByRole("radiogroup", { name: "Match" })
	).toBeInTheDocument();
	expect(screen.getByText("Match")).toBeInTheDocument();
});

test("aria-label names the radiogroup without a visible label", () => {
	render(() => (
		<Segment.Root aria-label="Match">
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	expect(
		screen.getByRole("radiogroup", { name: "Match" })
	).toBeInTheDocument();
	expect(screen.queryByText("Match")).toBeNull();
});

test("a disabled item ignores keyboard selection", () => {
	let picked = "exact";
	render(() => (
		<Segment.Root
			aria-label="Match"
			defaultValue="exact"
			onValueChange={(details) => (picked = details.value ?? "")}
		>
			<Segment.Item value="exact">Exact</Segment.Item>
			<Segment.Item
				value="range"
				disabled
				disabledReason="Not for this column"
			>
				Range
			</Segment.Item>
		</Segment.Root>
	));
	const range = radio("range");
	expect(range).toBeDisabled();
	expect(range.closest('[data-part="item"]')).toHaveAttribute(
		"data-disabled"
	);
	range.focus();
	fireEvent.keyDown(range, { key: " " });
	expect(picked).toBe("exact");
});

test("an item keeps the caller's class", () => {
	render(() => (
		<Segment.Root aria-label="Match">
			<Segment.Item value="exact" class="custom">
				Exact
			</Segment.Item>
		</Segment.Root>
	));
	expect(radio("exact").closest('[data-part="item"]')).toHaveClass("custom");
});

test("an unnamed group warns in development", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	render(() => (
		<Segment.Root label="">
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	expect(warn).toHaveBeenCalledWith(expect.stringContaining("aria-label"));
	warn.mockRestore();
});

test("a named group does not warn", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	render(() => (
		<Segment.Root aria-label="Match">
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});

test("a label prop keeps the labelled structure even while empty", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	render(() => (
		<Segment.Root label="">
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	const labelledBy = screen
		.getByRole("radiogroup")
		.getAttribute("aria-labelledby");
	expect(labelledBy).not.toBeNull();
	expect(document.getElementById(labelledBy ?? "")).not.toBeNull();
	warn.mockRestore();
});

test("classOverride restyles the indicator", () => {
	render(() => (
		<Segment.Root
			aria-label="Match"
			classOverride={{ indicatorClass: "custom-indicator" }}
		>
			<Segment.Item value="exact">Exact</Segment.Item>
		</Segment.Root>
	));
	expect(document.querySelector('[data-part="indicator"]')).toHaveClass(
		"custom-indicator"
	);
});
