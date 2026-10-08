// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { GuestRow } from "../columns/guestColumns.tsx";

// Ark's Dialog (the Drawer) mounts a Portal into document.body; unmount it
// between tests so nodes don't accumulate and slow later queries under load.
afterEach(cleanup);

// jsdom gaps that ark-ui's Checkbox (used by the Table selection column) touches.
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

// One shared timestamp for all three fixtures' `_creationTime` so they compare
// EQUAL under the `joinedAt desc` sort — a stable sort then keeps the fixture's
// own order (p1, p2, p3), which several tests rely on ("the ring starts on p1").
// Three separate `Date.now()` calls tie on a fast machine but straddle a
// millisecond on a slow CI runner, reordering the rows and upgrading the wrong
// guest — the flake that turned CI red.
const JOINED = Date.now();

const guestRow = {
	_id: "p1" as Id<"people">,
	_creationTime: JOINED,
	email: "guest@example.com",
	tier: "guest",
	stage: "active",
	firstName: "Ada",
	lastName: "Lovelace",
	accessUntil: Date.now() + 1000 * 60 * 60 * 24,
	status: {
		headline: "Guest · active",
		tone: "success",
		flags: [],
		facts: [],
		boardTasks: [],
		since: "",
	},
} as unknown as GuestRow;

const guestRow2 = {
	_id: "p2" as Id<"people">,
	_creationTime: JOINED,
	email: "alan@example.com",
	tier: "guest",
	stage: "active",
	firstName: "Alan",
	lastName: "Turing",
	accessUntil: Date.now() + 1000 * 60 * 60 * 48,
	status: {
		headline: "Guest · active",
		tone: "success",
		flags: [],
		facts: [],
		boardTasks: [],
		since: "",
	},
} as unknown as GuestRow;

// An expired guest: their status changes (stage flips to "expired") but they
// must not change TAB — spatial memory matters, so `useGuests` keeps
// returning them and `guestStatus` merely re-buckets them within this tab.
const expiredGuestRow = {
	_id: "p3" as Id<"people">,
	_creationTime: JOINED,
	email: "grace@example.com",
	tier: "guest",
	stage: "expired",
	firstName: "Grace",
	lastName: "Hopper",
	accessUntil: Date.now() - 1000 * 60 * 60 * 24,
	status: {
		headline: "Guest · expired",
		tone: "neutral",
		flags: [],
		facts: [],
		boardTasks: [],
		since: "",
	},
} as unknown as GuestRow;

vi.mock("../data/communityData.tsx", () => ({
	useGuests: () => ({
		data: () => [guestRow, guestRow2, expiredGuestRow],
		isLoading: () => false,
		error: () => undefined,
		isStale: () => false,
		refetch: () => {},
	}),
}));

// "Hosted by" is an enum of the current board, so the tab reads the board-level list to
// build the options.
vi.mock("../../../shared/data/boardLevel.tsx", () => ({
	useBoardLevel: () => ({
		data: () => [],
		isLoading: () => false,
		error: () => undefined,
		isStale: () => false,
		refetch: () => {},
	}),
}));

const upgradeToMember = vi.fn().mockResolvedValue(undefined);
const kickOut = vi.fn().mockResolvedValue(undefined);
vi.mock("../actions/triage.ts", () => ({
	useTriage: () => ({ upgradeToMember, kickOut }),
}));

// The Guests table's host-field cells call convex-solidjs' useMutation; the
// table also reads the current person via useQuery. Stub both so the columns
// render without a ConvexProvider mounted here.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => undefined }),
	useMutation: () => ({ mutateAsync: () => Promise.resolve() }),
	// `AgreementButton` resolves the document URL on click instead of holding a
	// per-row subscription, so the rows now need the raw client too.
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
}));

import { GuestsTab } from "./GuestsTab.tsx";
import { renderWithSelection } from "./testSelection.tsx";

test("upgrading a selected guest calls upgradeToMember with the row id", async () => {
	renderWithSelection((selection) => <GuestsTab selection={selection} />);

	// [0] is the header select-all checkbox; [1] is the (only) data row.
	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);

	// "Upgrade to member" is the IconButton's accessible name (an aria-label on
	// the <button>) — the visible glyph is the "person_add" ligature, and the
	// matching tooltip text lives in a portal, so query the control by role+name
	// rather than its label text. Scope to the data row's <tr> so we hit the
	// per-row action and not the same-named button that appears in the batch bar.
	const row = checkboxes[1].closest("tr") as HTMLElement;
	const upgrade = within(row).getByRole("button", {
		name: "Upgrade to member",
	});
	fireEvent.click(upgrade);

	await waitFor(() => {
		expect(upgradeToMember).toHaveBeenCalledWith("p1");
	});
});

test("clicking a row opens the drawer showing that guest's email", async () => {
	const { container } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));

	// Click a cell in the first data row
	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	await waitFor(() => {
		expect(screen.getByText("guest@example.com")).toBeInTheDocument();
	});
});

test("drawer body contains no inputs or textareas (read-only)", async () => {
	const { container } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));

	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	await waitFor(() => {
		expect(screen.getAllByText("guest@example.com")[0]).toBeInTheDocument();
	});

	// Scope the "no inputs" check to the Ark Dialog content panel so we don't
	// pick up Ark UI internals (like filter inputs) elsewhere in the document.
	// Ark renders Dialog.Content with data-scope="dialog" data-part="content".
	const dialogEl = document.querySelector<HTMLElement>(
		'[data-scope="dialog"][data-part="content"]'
	);
	expect(dialogEl).not.toBeNull();
	// Read-only means the PROFILE is display-only. The one editable control that
	// remains is the always-available board-notes composer — you can leave a note
	// without entering edit mode — so assert it is the only one.
	const editables = [
		...(dialogEl ?? document.body).querySelectorAll("input, textarea"),
	];
	expect(editables).toHaveLength(1);
	expect(editables[0]).toHaveAttribute("placeholder", "Add a note…");
});

test("drawer has Prev (disabled) and Next arrows; Next advances to second row", async () => {
	const { container } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));

	// Click the first data row to open the drawer
	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	await waitFor(() => {
		expect(screen.getAllByText("guest@example.com")[0]).toBeInTheDocument();
	});

	// Locate the dialog content panel; the Drawer uses a plain <header> inside it
	// (not Ark's Dialog.Header), so we scope to the content panel and find the
	// DrawerNav buttons (Previous / Next) within it.
	// Note: disabled DrawerNav buttons are wrapped in MakeDisablable's Tooltip span,
	// which makes them inaccessible to the standard AT query; use `hidden: true`.
	const dialogContent = document.querySelector<HTMLElement>(
		'[data-scope="dialog"][data-part="content"]'
	);
	expect(dialogContent).not.toBeNull();

	// Both arrows render in the drawer header
	const prevBtn = within(dialogContent ?? document.body).getByRole("button", {
		name: /previous/i,
		hidden: true,
	});
	const nextBtn = within(dialogContent ?? document.body).getByRole("button", {
		name: /next/i,
		hidden: true,
	});
	// Previous button should be disabled (first row in list)
	expect(prevBtn).toBeDisabled();

	// `onDisplayedRowsChange` fires via a reactive effect once the table renders;
	// wait for it to propagate so the nav has the full list and Next is enabled.
	await waitFor(() => {
		expect(nextBtn).not.toBeDisabled();
	});

	// Click Next → drawer should now show the second row's email
	fireEvent.click(nextBtn);
	await waitFor(() => {
		expect(screen.getAllByText("alan@example.com")[0]).toBeInTheDocument();
	});
});

test("an expired guest stays on the Guests tab, grouped under Expired", () => {
	const { container } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));
	// `useGuests` still returns the expired row (the query never drops
	// someone), and `guestStatus` buckets it "expired" rather than removing it
	// — the guest never changes tab, only group.
	expect(screen.getByRole("button", { name: /Expired/ })).toBeInTheDocument();
	expect(within(container).getAllByText("Grace")[0]).toBeInTheDocument();
});

test("pressing M upgrades the guest the open drawer is showing", async () => {
	upgradeToMember.mockClear();
	const { container } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));

	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);
	await waitFor(() => {
		expect(screen.getAllByText("guest@example.com")[0]).toBeInTheDocument();
	});

	// The drawer being open is enough on its own to make the scope "active"
	// — no `active` prop needed — and the open drawer's person wins the key
	// over anything else on the roster underneath it.
	fireEvent.keyDown(document, { key: "m" });
	await waitFor(() => {
		expect(upgradeToMember).toHaveBeenCalledWith("p1");
	});
});

test("M does nothing while this tab is not the one on screen and no drawer is open", async () => {
	upgradeToMember.mockClear();
	renderWithSelection((selection) => <GuestsTab selection={selection} />);

	// Nothing opened, `active` left unset (defaults to `false`): a
	// background tab's own action keys must stay dead, or a hidden tab's
	// rows would upgrade guests from under whichever tab is actually showing.
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	fireEvent.keyDown(document, { key: "m" });
	// `upgrade()` itself is async (it `await`s a confirm step before calling
	// the mutation), so a call that DID start would only reach the mock a
	// couple of microtasks later — asserting `not.toHaveBeenCalled()`
	// immediately would pass whether or not `active` correctly blocked
	// anything. A real macrotask tick lets any wrongly-started chain finish
	// before the check, so this actually pins the gate rather than racing it.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(upgradeToMember).not.toHaveBeenCalled();
});

test("M upgrades the focused row once this tab is marked active", async () => {
	upgradeToMember.mockClear();
	renderWithSelection((selection) => (
		<GuestsTab selection={selection} active />
	));

	// `autofocusFirstRow` puts the ring on the first displayed row at mount, so no
	// keypress is needed to reach it. The three fixture rows' `_creationTime`s are
	// captured moments apart at module load, close enough to tie under
	// `joinedAt desc` sorting — a stable sort keeps the fixture's own order, so the
	// ring starts on p1 (Ada), the same row the "Prev/Next" test opens by click.
	// The table claims focus once it is live, and the ring (and so the focused
	// row the letter acts on) shows only while focus is within it.
	await waitFor(() => {
		expect(screen.getByRole("grid")).toHaveFocus();
	});
	fireEvent.keyDown(document, { key: "m" });
	await waitFor(() => {
		expect(upgradeToMember).toHaveBeenCalledWith("p1");
	});
});

test("M acts when the key is pressed ON the focused grid", async () => {
	upgradeToMember.mockClear();
	renderWithSelection((selection) => (
		<GuestsTab selection={selection} active />
	));

	// In a browser the keystroke's target is the focused grid itself, not
	// `document`. The grid must not count as a typing target, or every
	// row-scoped letter shortcut would be dead while the table has focus.
	const grid = screen.getByRole("grid");
	await waitFor(() => {
		expect(grid).toHaveFocus();
	});
	fireEvent.keyDown(grid, { key: "m" });
	await waitFor(() => {
		expect(upgradeToMember).toHaveBeenCalledWith("p1");
	});
});

test("a letter does not act on a row whose focused node was removed without a focusout", async () => {
	upgradeToMember.mockClear();
	renderWithSelection((selection) => (
		<GuestsTab selection={selection} active />
	));
	const grid = screen.getByRole("grid");
	await waitFor(() => {
		expect(grid).toHaveFocus();
	});
	// Focus a control inside the grid, then drop it from the DOM. Browsers fire
	// no focusout for that, so the table still believes focus is within it and
	// the ringed row is still the letter's target, until it re-reads the DOM.
	const probe = document.createElement("button");
	grid.querySelector("td")?.append(probe);
	probe.focus();
	probe.remove();
	expect(document.activeElement).toBe(document.body);
	fireEvent.keyDown(document.body, { key: "m" });
	// `upgrade()` awaits a confirm step before calling the mutation, so give a
	// wrongly-started chain a real macrotask to reach the mock.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(upgradeToMember).not.toHaveBeenCalled();
});

test("dismissing the drawer clears the person from the URL", async () => {
	const { container, url } = renderWithSelection((selection) => (
		<GuestsTab selection={selection} />
	));
	fireEvent.click(within(container).getAllByText("Ada")[0]);
	await waitFor(() => {
		expect(url()).toContain("person=p1");
	});

	// Dismissing is the user closing the drawer, so the entry the open pushed is
	// popped and the param goes with it.
	fireEvent.click(screen.getByRole("button", { name: /close/i }));
	await waitFor(() => {
		expect(url()).not.toContain("person=");
	});
});
