// @vitest-environment happy-dom
import { Accordion } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Doc } from "../../../convex/_generated/dataModel";

import { EventTvSection } from "./EventTvSection.tsx";

afterEach(cleanup);

// 2026-10-01 20:00Z end: the default cutoff is five days later, 2026-10-06
// 20:00Z = 22:00 in Zurich (CEST).
const BASE = {
	_id: "event1",
	_creationTime: 0,
	name: "Open House",
	startsAt: Date.parse("2026-10-01T18:00:00Z"),
	endsAt: Date.parse("2026-10-01T20:00:00Z"),
	startsAtLocal: "2026-10-01T20:00:00+02:00[Europe/Zurich]",
	endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
	createdBy: "person1",
	createdAt: 0,
};

function renderSection(
	overrides: Partial<Doc<"events">>,
	isEditing: boolean,
	onPatch = vi.fn()
) {
	const event = { ...BASE, ...overrides } as Doc<"events">;
	render(() => (
		<Accordion.Root multiple value={["tv"]}>
			<EventTvSection
				event={() => event}
				isEditing={() => isEditing}
				onPatch={onPatch}
			/>
		</Accordion.Root>
	));
	return onPatch;
}

function dateRoot(): HTMLElement {
	const root = document.querySelector<HTMLElement>(
		'[data-part="hidden-input"]'
	)?.parentElement;
	if (!root) throw new Error("no date field");
	return root;
}

test("the Show on TV switch reflects the event and toggling patches showOnTv", async () => {
	const onPatch = renderSection({ showOnTv: false }, true);
	const toggle = screen.getByRole("switch", { name: "Shown on TV" });
	expect((toggle as HTMLInputElement).checked).toBe(false);
	fireEvent.click(toggle);
	await waitFor(() => {
		expect(onPatch).toHaveBeenCalledWith({ showOnTv: true });
	});
});

test("a switched-on event shows the switch on", () => {
	renderSection({ showOnTv: true }, true);
	expect(screen.getByRole("switch", { name: "Shown on TV" })).toBeChecked();
});

test("with no cutoff set the date shows the derived default and no Use default action", async () => {
	renderSection({}, true);
	// The segments' order and padding follow the locale; their numbers do not.
	await waitFor(() => {
		const numbers = [
			...dateRoot().querySelectorAll(
				'[data-part="segment"][data-editable]'
			),
		]
			.map((segment) => Number(segment.textContent))
			.sort((first, second) => first - second);
		expect(numbers).toEqual([6, 10, 2026]);
	});
	expect(screen.queryByRole("button", { name: "Use default" })).toBeNull();
});

test("with a cutoff set, Use default clears it", () => {
	const onPatch = renderSection(
		{ tvUntil: Date.parse("2026-10-10T21:59:00Z") },
		true
	);
	fireEvent.click(screen.getByRole("button", { name: "Use default" }));
	expect(onPatch).toHaveBeenCalledWith({ tvUntilLocal: null });
});

test("choosing a date patches the end of that day in Zurich", async () => {
	const onPatch = renderSection({}, true);
	const segment = dateRoot().querySelector<HTMLElement>(
		'[data-part="segment"][data-editable]'
	);
	if (!segment) throw new Error("no segment");
	segment.focus();
	fireEvent.paste(segment, {
		clipboardData: {
			getData: () => "2026-10-10",
		} as unknown as DataTransfer,
	});
	await waitFor(() => {
		expect(onPatch).toHaveBeenCalledWith({
			tvUntilLocal: "2026-10-10T23:59:00+02:00[Europe/Zurich]",
		});
	});
});

test("read-only shows text, no controls", () => {
	renderSection({ showOnTv: true }, false);
	expect(screen.queryByRole("switch")).toBeNull();
	expect(screen.queryByRole("button", { name: "Use default" })).toBeNull();
	expect(screen.getByText("Yes")).toBeInTheDocument();
	expect(screen.getByText(/6 Oct 2026/)).toBeInTheDocument();
});

test("moving the event's end with no cutoff set does not write the default", async () => {
	const [event, setEvent] = createSignal({ ...BASE } as Doc<"events">);
	const onPatch = vi.fn();
	render(() => (
		<Accordion.Root multiple value={["tv"]}>
			<EventTvSection
				event={event}
				isEditing={() => true}
				onPatch={onPatch}
			/>
		</Accordion.Root>
	));
	setEvent({
		...BASE,
		endsAt: BASE.endsAt + 86_400_000,
		endsAtLocal: "2026-10-02T22:00:00+02:00[Europe/Zurich]",
	} as Doc<"events">);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(onPatch).not.toHaveBeenCalled();
});

test.each([
	[{ showOnTv: true, tvStatus: "shown" as const }, "On the TV"],
	[
		{
			showOnTv: true,
			tvStatus: "shown" as const,
			tvStatusDetail: "noPicture",
		},
		"On the TV without its picture (the pack is nearly full)",
	],
	[
		{
			showOnTv: true,
			tvStatus: "full" as const,
			tvStatusDetail: "the pack is full",
		},
		"Not on the TV: the pack is full. Remove a slide in Space > TV.",
	],
	[
		{ showOnTv: true, tvStatus: "waiting" as const },
		"Waiting for the TV list to be moved",
	],
])("says where the TV slide stands: %j", (fields, text) => {
	renderSection(fields, false);
	expect(screen.getByText(text)).toBeInTheDocument();
});

test("says nothing about the TV slide before a sync, or for an event that is not on the TV", () => {
	renderSection({ showOnTv: true }, false);
	expect(screen.queryByText("TV status")).toBeNull();
	cleanup();
	renderSection({ showOnTv: false, tvStatus: "full" }, false);
	expect(screen.queryByText("TV status")).toBeNull();
});
