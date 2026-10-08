// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// jsdom gaps ark-ui touches at mount.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// Typed via generics to accept one arg (not `()`) so `mutateAsync.mock.calls[0][0]`
// below indexes a non-empty tuple — `vi.fn(() => ...)` infers `Parameters` as `[]`,
// which fails to typecheck at that index. Generics avoid an unused named param
// (this repo's eslint has no underscore-arg ignore, so `--max-warnings 0` rejects one).
const mutateAsync = vi.fn<(args: unknown) => Promise<string>>(() =>
	Promise.resolve("event2")
);
const attendees = [
	{
		personId: "p1",
		name: "Ada Lovelace",
		email: "ada@example.com",
		confirmedAt: Date.parse("2026-10-01T19:00:00Z"),
	},
];

vi.mock("convex-solidjs", () => ({
	useQuery: () => ({
		data: () => attendees,
		error: () => undefined,
		isLoading: () => false,
	}),
	useMutation: () => ({ mutateAsync }),
}));

import { utcFromLocal } from "../../../convex/lib/time.ts";
import { AbilityProvider, type Role } from "../../lib/ability.tsx";
import { ConfirmProvider } from "../../shared/confirm.tsx";

import { EventDrawer } from "./EventDrawer.tsx";

// 2026-10-01 is CEST (Europe/Zurich, UTC+02:00): 18:00Z/20:00Z above are
// 20:00/22:00 local. The `*Local` fields are fixed IXDTF literals (not
// derived via the util under test) so the seeding test below is not
// tautological.
const event = {
	_id: "event1",
	_creationTime: 0,
	name: "Open House",
	startsAt: Date.parse("2026-10-01T18:00:00Z"),
	endsAt: Date.parse("2026-10-01T20:00:00Z"),
	startsAtLocal: "2026-10-01T20:00:00+02:00[Europe/Zurich]",
	endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
	createdBy: "person1",
	createdAt: Date.parse("2026-09-01T00:00:00Z"),
} as never;

afterEach(() => {
	mutateAsync.mockClear();
});

function renderDrawer(role: Role, props: Record<string, unknown>) {
	return render(() => (
		<ConfirmProvider>
			<AbilityProvider role={role}>
				<EventDrawer open onOpenChange={() => {}} {...props} />
			</AbilityProvider>
		</ConfirmProvider>
	));
}

test("detail (board): shows name, visitor QR download, attendees and delete", () => {
	renderDrawer("board", { event });
	expect(screen.getAllByText("Open House").length).toBeGreaterThan(0);
	expect(
		screen.getByRole("button", { name: /Download QR/ })
	).toBeInTheDocument();
	expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Delete event/ })
	).toBeInTheDocument();
});

test("detail (member): name only — no QR, attendees, delete or edit", () => {
	renderDrawer("member", { event });
	expect(screen.getAllByText("Open House").length).toBeGreaterThan(0);
	expect(screen.queryByRole("button", { name: /Download QR/ })).toBeNull();
	expect(screen.queryByText("Ada Lovelace")).toBeNull();
	expect(screen.queryByRole("button", { name: /Delete event/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Unlock to edit/ })).toBeNull();
});

test("Copy link writes the visitor URL to the clipboard", async () => {
	const writeText = vi.fn(() => Promise.resolve());
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	renderDrawer("board", { event });
	fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
	await waitFor(() => {
		expect(writeText).toHaveBeenCalledWith(
			`${window.location.origin}/visitor?event=event1`
		);
	});
});

test("Delete waits for confirmation, then calls deleteEvent", async () => {
	const onOpenChange = vi.fn();
	renderDrawer("board", { event, onOpenChange });
	fireEvent.click(screen.getByRole("button", { name: /Delete event/ }));
	await screen.findByText("Delete event?");
	expect(mutateAsync).not.toHaveBeenCalled();
	const footer = screen.getByRole("button", {
		name: /Cancel/,
		hidden: true,
	}).parentElement!;
	fireEvent.click(
		within(footer).getByRole("button", { name: /Delete/, hidden: true })
	);
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({ eventId: "event1" });
	});
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("edit toggle reveals the name field; committing it calls updateEvent", async () => {
	renderDrawer("board", { event });
	fireEvent.click(screen.getByRole("button", { name: /Unlock to edit/ }));
	const field = await waitFor(() => screen.getByRole("textbox"));
	// EditableText commits on blur when the value changed.
	fireEvent.input(field, { target: { value: "Renamed Night" } });
	fireEvent.blur(field);
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({
			eventId: "event1",
			name: "Renamed Night",
		});
	});
});

test("create mode (board): shows the name field and Create button", () => {
	renderDrawer("board", {});
	expect(screen.getByLabelText("Name")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: /^Create/ })).toBeInTheDocument();
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows the skeleton (shaped like the loaded fields), not the create form or the 'New event' title", () => {
	renderDrawer("board", { loading: true });
	expect(screen.queryByText("New event")).toBeNull();
	expect(screen.queryByLabelText("Name")).toBeNull();
	expect(screen.queryByRole("button", { name: /^Create/ })).toBeNull();
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	expect(screen.getByText("Starts")).toBeInTheDocument();
});

test("loading with an event also set (stale-during-refetch) still shows the skeleton, not the name", () => {
	renderDrawer("board", { event, loading: true });
	expect(screen.queryByText("Open House")).toBeNull();
});

test("no event, not loading: shows the create form and 'New event' title", () => {
	renderDrawer("board", {});
	expect(screen.getByText("New event")).toBeInTheDocument();
});

test("create mode: shows the Zurich hint under the time pickers", () => {
	renderDrawer("board", {});
	expect(screen.getByText(/Times are Europe\/Zurich/)).toBeInTheDocument();
});

// --- start/end time pickers ---------------------------------------------

/**
 * Pastes an ISO `YYYY-MM-DD` string into a DatePicker's segmented input. The
 * zag date-input machine's paste handler (`SEGMENT.PASTE`) parses the whole
 * clipboard string with `@internationalized/date`'s `parseDate` and replaces
 * the entire date value in one shot — which segment receives focus doesn't
 * matter, so this focuses the first editable (non-separator) segment.
 */
function pasteIntoDateField(root: HTMLElement, iso: string): void {
	const seg = root.querySelector<HTMLElement>(
		'[data-part="segment"][data-editable]'
	);
	if (!seg) throw new Error("no editable segment found in date field");
	seg.focus();
	fireEvent.paste(seg, {
		clipboardData: { getData: () => iso } as unknown as DataTransfer,
	});
}

/**
 * Finds a labelled DatePicker (label is a sibling of its field root, as
 * rendered by the create form) and pastes an ISO date into it, then waits
 * for the zag machine's reconciliation to land — firing two of these back to
 * back with no settling point in between (the segment focus/blur transitions
 * each field's machine goes through) has been observed to drop the first
 * field's update.
 */
async function pasteDate(labelText: string, iso: string): Promise<void> {
	const label = screen.getByText(labelText);
	const root = label.parentElement;
	if (!root) throw new Error(`no field root for "${labelText}"`);
	pasteIntoDateField(root, iso);
	await waitFor(() => {
		const hidden = root.querySelector<HTMLInputElement>(
			'[data-part="hidden-input"]'
		);
		expect(hidden?.value).toBeTruthy();
	});
}

/** The `PropertyRow` value cell for a given label, scoped so a query for a
 * segment type (e.g. `[data-type="minute"]`) only matches within that row. */
function propertyRowValue(labelText: string): HTMLElement {
	const label = screen.getByText(labelText);
	const key = label.parentElement;
	const row = key?.parentElement;
	const value = row?.children[1] as HTMLElement | undefined;
	if (!value) throw new Error(`no value cell for "${labelText}"`);
	return value;
}

function adjustSegment(
	el: HTMLElement,
	key: "ArrowUp" | "ArrowDown" = "ArrowUp"
): void {
	el.focus();
	fireEvent.keyDown(el, { key });
}

test("create: default start/end times (00:01 / 23:59) compose as Europe/Zurich instants", async () => {
	renderDrawer("board", {});

	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "Autumn Mixer" },
	});
	await pasteDate("Starts", "2026-11-03");
	await pasteDate("Ends", "2026-11-05");

	const createButton = screen.getByRole("button", { name: /^Create/ });
	await waitFor(() => {
		expect(createButton).not.toBeDisabled();
	});
	fireEvent.click(createButton);

	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});
	const call = mutateAsync.mock.calls[0][0] as {
		name: string;
		startsAtLocal: string;
		endsAtLocal: string;
	};
	expect(call.name).toBe("Autumn Mixer");
	// November is CET (Europe/Zurich, UTC+01:00): 00:01 local on the 3rd is
	// 23:01Z on the 2nd; 23:59 local on the 5th is 22:59Z the same day.
	expect(utcFromLocal(call.startsAtLocal)).toBe(
		Date.parse("2026-11-02T23:01:00Z")
	);
	expect(utcFromLocal(call.endsAtLocal)).toBe(
		Date.parse("2026-11-05T22:59:00Z")
	);
});

test("create: composes start/end as Europe/Zurich instants regardless of host TZ", async () => {
	// Regression for the old drawer, which composed `new Date(y, m, d, h, min)`
	// in the HOST's local zone. CI runs with TZ=UTC (a non-Zurich host), so
	// under the old code 00:01 would land at 00:01Z — an hour off Zurich's
	// CEST offset — and there would be no `startsAtLocal` key on the call at
	// all (the old mutation args were numeric `startsAt`/`endsAt`).
	renderDrawer("board", {});

	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "Regression Check" },
	});
	await pasteDate("Starts", "2026-09-20");
	await pasteDate("Ends", "2026-09-20");

	const createButton = screen.getByRole("button", { name: /^Create/ });
	await waitFor(() => {
		expect(createButton).not.toBeDisabled();
	});
	fireEvent.click(createButton);

	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});
	const call = mutateAsync.mock.calls[0][0] as {
		startsAtLocal: string;
		endsAtLocal: string;
	};
	// September is CEST (UTC+02:00): 00:01 local -> 22:01Z the prior day;
	// 23:59 local -> 21:59Z the same day.
	expect(utcFromLocal(call.startsAtLocal)).toBe(
		new Date("2026-09-19T22:01:00.000Z").getTime()
	);
	expect(utcFromLocal(call.endsAtLocal)).toBe(
		new Date("2026-09-20T21:59:00.000Z").getTime()
	);
});

test("create: an inverted interval (start after end) disables Create with a distinct reason", async () => {
	renderDrawer("board", {});

	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "Autumn Mixer" },
	});

	const createButton = screen.getByRole("button", { name: /^Create/ });
	// Missing dates: the original "add a name and both dates" reason.
	expect(createButton).toBeDisabled();
	expect(createButton).toHaveAttribute(
		"aria-description",
		"Add a name and both dates first"
	);

	// Starts AFTER ends — name + both dates are present, but the composed
	// interval is inverted, so the reason must call that out distinctly
	// rather than repeat the (now false) missing-fields message.
	await pasteDate("Starts", "2026-11-05");
	await pasteDate("Ends", "2026-11-03");

	await waitFor(() => {
		expect(createButton).toHaveAttribute(
			"aria-description",
			"The start must be on or before the end."
		);
	});
	expect(createButton).toBeDisabled();
});

test("edit: the start time picker seeds from startsAtLocal (Zurich wall clock, not the host TZ) and recomposes it on change", async () => {
	renderDrawer("board", { event });
	fireEvent.click(screen.getByRole("button", { name: /Unlock to edit/ }));
	await waitFor(() => screen.getByRole("textbox"));

	const startsValue = propertyRowValue("Starts");
	const hour = startsValue.querySelector<HTMLElement>('[data-type="hour"]');
	const minute = startsValue.querySelector<HTMLElement>(
		'[data-type="minute"]'
	);
	if (!hour || !minute) throw new Error("time segments not found");

	// Fixture's `startsAtLocal` is fixed at 2026-10-01T20:00 Europe/Zurich
	// (CEST). Under CI's TZ=UTC, the OLD epoch-seeded code would show 18:00
	// (the raw UTC hour) — this pins the zoned wall clock instead.
	expect(hour).toHaveAttribute("data-value", "20");
	expect(minute).toHaveAttribute("data-value", "0");

	adjustSegment(minute, "ArrowUp");

	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});
	const call = mutateAsync.mock.calls[0][0] as {
		eventId: string;
		startsAtLocal: string;
	};
	expect(call.eventId).toBe("event1");
	// 20:01 Zurich (CEST, +02:00) -> 18:01Z.
	expect(utcFromLocal(call.startsAtLocal)).toBe(
		Date.parse("2026-10-01T18:01:00Z")
	);
});
