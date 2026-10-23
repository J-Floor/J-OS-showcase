// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

// jsdom gaps ark-ui / the Table touch at mount.
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

const mutateAsync = vi.fn(() => Promise.resolve("event2"));

const oneEvent = [
	{
		_id: "event1",
		_creationTime: 0,
		name: "Open House",
		startsAt: Date.parse("2026-10-01T18:00:00Z"),
		endsAt: Date.parse("2026-10-01T20:00:00Z"),
		// Zurich wall-clock of the epochs above (CEST, +02 on 1 Oct) — required
		// now that events `*Local` is non-optional and the sheet reads it.
		startsAtLocal: "2026-10-01T20:00:00+02:00[Europe/Zurich]",
		endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
		createdBy: "person1",
		createdAt: Date.parse("2026-09-01T00:00:00Z"),
	},
];

// useQuery serves both listEvents (args `{}`) and listEventAttendees (args
// `{eventId}`). Convex's `api` is a proxy whose refs aren't `===`-stable, so we
// route by args shape, not by comparing the query ref. `q` (hoisted) holds the
// event rows the factory reads — `undefined` models the query still loading.
const queryState = vi.hoisted(() => ({
	rows: (): unknown[] | undefined => [],
}));
vi.mock("convex-solidjs", () => ({
	useQuery: (_query: unknown, args: unknown) => {
		const resolvedArgs =
			typeof args === "function" ? (args as () => unknown)() : args;
		const isAttendees =
			!!resolvedArgs &&
			typeof resolvedArgs === "object" &&
			"eventId" in resolvedArgs;
		return {
			data: () => (isAttendees ? [] : queryState.rows()),
			error: () => {},
			isLoading: () => false,
		};
	},
	useMutation: () => ({ mutateAsync }),
}));

import { AbilityProvider, type Role } from "../../lib/ability.tsx";

import { EventsPage } from "./EventsPage.tsx";

const [rows, setRows] = createSignal<(typeof oneEvent)[number][] | undefined>(
	oneEvent
);
queryState.rows = rows;

afterEach(() => {
	mutateAsync.mockClear();
	setRows(oneEvent);
});

// MemoryRouter: EventsPage uses useSearchParams to deep-link the open event.
function renderAs(role: Role) {
	return render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<EventsPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("lists an event in the table", () => {
	renderAs("member");
	expect(screen.getByText("Open House")).toBeInTheDocument();
});

test("shows a loading skeleton while events are undefined, not the empty state", () => {
	setRows(undefined);
	renderAs("board");
	expect(screen.queryByText("No events yet")).toBeNull();
	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);
});

test("shows the empty state once events resolve with no rows", () => {
	setRows([]);
	renderAs("board");
	expect(screen.getByText("No events yet")).toBeInTheDocument();
	expect(document.querySelectorAll("[data-skeleton-row]")).toHaveLength(0);
});

test("groups events into Future / Current / Past accordion sections", () => {
	const now = Date.now();
	const HOUR = 3_600_000;
	const base = {
		_creationTime: 0,
		createdBy: "person1",
		createdAt: Date.parse("2026-09-01T00:00:00Z"),
		// Required by the schema type; unused by this test (grouping reads the
		// epochs for the phase and the name for the label, never `*Local`).
		startsAtLocal: "2026-10-01T20:00:00+02:00[Europe/Zurich]",
		endsAtLocal: "2026-10-01T22:00:00+02:00[Europe/Zurich]",
	};
	setRows([
		{
			...base,
			_id: "f",
			name: "Alpha Fest",
			startsAt: now + 48 * HOUR,
			endsAt: now + 50 * HOUR,
		},
		{
			...base,
			_id: "c",
			name: "Bravo Con",
			startsAt: now - HOUR,
			endsAt: now + HOUR,
		},
		{
			...base,
			_id: "p",
			name: "Charlie Party",
			startsAt: now - 50 * HOUR,
			endsAt: now - 48 * HOUR,
		},
	]);
	renderAs("board");
	// Group header labels (the hidden `phase` column's enum labels), one per
	// occupied bucket.
	expect(screen.getByText("Future")).toBeInTheDocument();
	expect(screen.getByText("Current")).toBeInTheDocument();
	expect(screen.getByText("Past")).toBeInTheDocument();
});

test("lists the newest event first in every phase group, whatever order the query sends", () => {
	const now = Date.now();
	const DAY = 86_400_000;
	function event(id: string, name: string, startsIn: number) {
		return {
			...oneEvent[0],
			_id: id,
			name,
			startsAt: now + startsIn * DAY,
			endsAt: now + (startsIn + 1) * DAY,
		};
	}
	setRows([
		event("f1", "Sooner Fest", 2),
		event("p1", "Older Fest", -20),
		event("f2", "Later Fest", 9),
		event("p2", "Recent Fest", -5),
	]);
	renderAs("board");
	const names = screen
		.getAllByText(/Fest$/)
		.map((element) => element.textContent);
	expect(names).toEqual([
		"Later Fest",
		"Sooner Fest",
		"Recent Fest",
		"Older Fest",
	]);
});

test("a column sort the user picks replaces the default", async () => {
	const now = Date.now();
	const DAY = 86_400_000;
	setRows([
		{
			...oneEvent[0],
			_id: "a",
			name: "Alpha Fest",
			startsAt: now + 2 * DAY,
			endsAt: now + 3 * DAY,
		},
		{
			...oneEvent[0],
			_id: "b",
			name: "Bravo Fest",
			startsAt: now + 9 * DAY,
			endsAt: now + 10 * DAY,
		},
	]);
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /Sort by Name/ }));
	await waitFor(() => {
		expect(
			screen.getAllByText(/Fest$/).map((element) => element.textContent)
		).toEqual(["Alpha Fest", "Bravo Fest"]);
	});
});

test("does not render a redundant page title", () => {
	renderAs("board");
	expect(screen.queryByRole("heading", { name: /^Events$/ })).toBeNull();
});

test("a member sees the table but not the New event button", () => {
	renderAs("member");
	expect(screen.queryByRole("button", { name: /New event/ })).toBeNull();
});

test("board sees the New event button", () => {
	renderAs("board");
	expect(
		screen.getByRole("button", { name: /New event/ })
	).toBeInTheDocument();
});

test("board: New event sits in the page's floating toolbar", () => {
	renderAs("board");
	expect(
		screen.getByRole("button", { name: /New event/ }).parentElement
	).toHaveAttribute("data-part", "floating-toolbar");
});

test("a member gets no floating toolbar (an empty one would still float)", () => {
	renderAs("member");
	expect(document.querySelector('[data-part="floating-toolbar"]')).toBeNull();
});

test("board: clicking a row opens the detail sheet", async () => {
	renderAs("board");
	fireEvent.click(screen.getAllByText("Open House")[0]);
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
});

test("board: New event opens the create sheet", async () => {
	renderAs("board");
	fireEvent.click(screen.getByRole("button", { name: /New event/ }));
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
	expect(screen.getByRole("button", { name: /^Create/ })).toBeInTheDocument();
});

test("closes the sheet if the open event disappears from the live list", async () => {
	renderAs("board");
	fireEvent.click(screen.getAllByText("Open House")[0]);
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
	setRows([]);
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

test("a ?event= deep link (command palette / shared URL) opens the sheet", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/events?event=event1", replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role="board">
						<EventsPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
});

// PR #82 regression guard: a sheet close must actually clear the `?event=`
// deep-link param, exercised through the sheet's own Close button — not a
// mocked `onOpenChange` call.
test("board: closing the sheet via the Close button clears ?event=", async () => {
	const history = createMemoryHistory();
	history.set({ value: "/events", scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role="board">
						<EventsPage />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	fireEvent.click(screen.getAllByText("Open House")[0]);
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
	expect(history.get()).toContain("event=event1");

	fireEvent.click(screen.getByRole("button", { name: /close/i }));

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(history.get()).not.toContain("event=");
});
