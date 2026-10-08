// @vitest-environment happy-dom
import {
	screen,
	fireEvent,
	waitFor,
	within,
	cleanup,
} from "@solidjs/testing-library";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

// apps/web does not run vitest in `globals` mode, so `@solidjs/testing-library`'s
// own auto-cleanup — which only registers itself when it finds a GLOBAL
// `afterEach` — never fires here. Without this, a `document`-level key
// binding registered by one test (this tab now binds D/G/M/U) outlives it,
// and the next test's keydown fires every stale handler alongside its own.
afterEach(cleanup);

// jsdom gaps that ark-ui / the Table touch.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	Object.defineProperty(Element.prototype, "scrollTo", {
		value: () => {},
		writable: true,
		configurable: true,
	});
	if (
		!(Element.prototype as { hasPointerCapture?: unknown })
			.hasPointerCapture
	) {
		Element.prototype.hasPointerCapture = () => false;
	}
});

// Minimal column set: enough to render group headers (triageGroup) + a leaf
// cell. Avoids pulling in the real applicationColumns (which import the convex
// client via its ScoreCell). CurrentPersonContext is a real Solid context so the
// tab's <CurrentPersonContext.Provider> works against the same object.
vi.mock("../columns/applicationColumns.tsx", async () => {
	const { createContext } = await import("solid-js");
	return {
		// Mirror the real applicationColumns' grouping column: `triageGroup`,
		// `dataType: "enum"` with `enumOptions` ordered toScore → queue → denied.
		// That order is load-bearing — it fixes the on-screen group order the
		// selection and drawer-nav tests below assert against. `state` has no
		// column of its own (the tab filters the data instead), so none here.
		applicationColumns: () => [
			{
				id: "triageGroup",
				header: "Group",
				dataType: "enum",
				enumOptions: [
					{ value: "toScore", label: "To score" },
					{ value: "queue", label: "Queue" },
					{ value: "denied", label: "Denied" },
				],
				accessorFn: (r: {
					stage?: string;
					board?: { score?: number };
				}) =>
					r.stage === "denied"
						? "denied"
						: r.board?.score != null
							? "queue"
							: "toScore",
			},
			{ accessorKey: "name", header: "Name", dataType: "string" },
			{
				accessorKey: "firstName",
				header: "First name",
				dataType: "string",
			},
		],
		CurrentPersonContext: createContext(() => undefined),
	};
});

// ApplicationsTable reads the current person via convex-solidjs' useQuery to seed
// CurrentPersonContext; that needs a ConvexProvider we don't mount here. Stub the
// hook to a no-data accessor so the table renders without the Convex client.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => undefined }),
	// The shared drawer opens mutations of its own (the board's door override,
	// the onboarding step "Done" button); this tab used to render a drawer that
	// had none.
	useMutation: () => ({
		mutateAsync: () => Promise.resolve(),
		mutate: vi.fn(),
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
		reset: vi.fn(),
	}),
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
}));

/** The three tabs share one query shape now, so these rows carry the status
 *  readout and agreement flag the shared drawer renders from. */
function status(stage: "queued" | "denied" | "verified") {
	return {
		tier: "prospect" as const,
		stage,
		tone: "info" as const,
		flags: [],
		facts: [
			{ id: "role" as const, tier: "prospect" as const },
			{ id: "state" as const, stage, tone: "info" as const },
			{ id: "since" as const, days: 0 },
			{ id: "agreement" as const, state: "not_required" as const },
			{ id: "door" as const, state: "closed" as const },
		],
		boardTasks: [],
		sinceDays: 0,
	};
}

const rows = [
	{
		_id: "app1",
		status: status("queued"),
		hasAgreement: false,
		name: "Ada",
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		tier: "prospect",
		// Scored → lands in the "Queue" group, below the unscored rows.
		stage: "queued",
		board: { score: 8 },
		_creationTime: 0,
		vertical: ["ai", "healthtech"],
		venture: {
			name: "Engine Co",
			description: "Building analytical engines",
			whyJoin: "To collaborate with brilliant minds",
			productStage: "mvp",
			fundingStage: "pre_seed",
		},
	},
	{
		_id: "app2",
		status: status("denied"),
		hasAgreement: false,
		name: "Babbage",
		firstName: "Charles",
		lastName: "Babbage",
		email: "charles@example.com",
		tier: "prospect",
		stage: "denied",
		_creationTime: 0,
	},
	{
		_id: "app3",
		status: status("verified"),
		hasAgreement: false,
		name: "Hopper",
		firstName: "Grace",
		lastName: "Hopper",
		email: "grace@example.com",
		tier: "prospect",
		// Verified with no score → the "To score" group, the first one on screen.
		stage: "verified",
		_creationTime: 0,
	},
];

vi.mock("../data/useApplications.ts", () => ({
	useApplications: () => ({
		data: () => rows,
		error: () => undefined,
		isLoading: () => false,
		isStale: () => false,
		refetch: () => {},
	}),
}));

const deny = vi.fn().mockResolvedValue(undefined);
const makeMember = vi.fn().mockResolvedValue(undefined);
const undeny = vi.fn().mockResolvedValue(undefined);

vi.mock("../actions/triage.ts", () => ({
	useTriage: () => ({
		deny,
		makeMember,
		approveAsGuest: vi.fn().mockResolvedValue(undefined),
		undeny,
		kickOut: vi.fn().mockResolvedValue(undefined),
		upgradeToMember: vi.fn().mockResolvedValue(undefined),
	}),
}));

import { ApplicationsTab } from "./ApplicationsTab.tsx";
import { renderWithSelection } from "./testSelection.tsx";

describe("ApplicationsTab", () => {
	test("renders a group header per triage bucket", () => {
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));
		// Each group header is a toggle button rendering the enum *label* for the
		// grouped `triageGroup` value plus a row count, e.g. "Queue (1)". Match on
		// the label with a regex since the count shares the element.
		expect(
			screen.getByRole("button", { name: /Queue/ })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /To score/ })
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Denied/ })
		).toBeInTheDocument();
	});

	test("selecting a row + Make member calls makeMember with that row's id", async () => {
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// checkbox[0] is the header select-all; the next are leaf-row checkboxes.
		const checkboxes = screen.getAllByRole("checkbox");
		expect(checkboxes.length).toBeGreaterThan(1);
		fireEvent.click(checkboxes[1]);

		// Batch bar appears once a row is selected. Match the button by its
		// accessible name with a regex: the leading <Icon> is aria-hidden but the
		// Button keeps an always-mounted Spinner whose "Loading" label is appended
		// to the computed name (i.e. the name is "Make member Loading").
		const button = await screen.findByRole("button", {
			name: /Make member/,
		});
		fireEvent.click(button);

		await waitFor(() => {
			expect(makeMember).toHaveBeenCalledTimes(1);
		});
		// The first selected leaf row ("To score" group → "app3").
		expect(makeMember).toHaveBeenCalledWith("app3");
	});

	test("selecting a denied application + Undo deny calls undeny with that row's id", async () => {
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// Group order is To score, Queue, Denied: checkbox[1] is app3 (To score),
		// checkbox[2] is app1 (Queue), checkbox[3] is app2 — the only denied row.
		const checkboxes = screen.getAllByRole("checkbox");
		expect(checkboxes.length).toBeGreaterThan(3);
		fireEvent.click(checkboxes[3]);

		// "Undo deny" only appears once a denied row is selected — pins that a
		// mis-clicked Deny is recoverable from the console.
		const button = await screen.findByRole("button", {
			name: /Undo deny/,
		});
		fireEvent.click(button);

		await waitFor(() => {
			expect(undeny).toHaveBeenCalledTimes(1);
		});
		expect(undeny).toHaveBeenCalledWith("app2");
	});

	test("Undo deny is not offered when the selection has no denied row", async () => {
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// checkbox[1] is app3 (To score, not denied).
		const checkboxes = screen.getAllByRole("checkbox");
		fireEvent.click(checkboxes[1]);

		await screen.findByRole("button", { name: /Make member/ });
		expect(
			screen.queryByRole("button", { name: /Undo deny/ })
		).not.toBeInTheDocument();
	});

	test("clicking an application row opens the drawer showing that applicant's email", async () => {
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// Click the first name cell of the Queue row ("Ada"); the row's position in
		// the table doesn't matter to this assertion.
		// Use within(container) + getAllByText[0] to handle any Portal DOM leftovers.
		const adaCell = within(container).getAllByText("Ada")[0];
		fireEvent.click(adaCell);

		await waitFor(() => {
			expect(
				screen.getAllByText("ada@example.com")[0]
			).toBeInTheDocument();
		});
	});

	test("application detail drawer shows expanded fields (description, why-join)", async () => {
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		const adaCell = within(container).getAllByText("Ada")[0];
		fireEvent.click(adaCell);

		await waitFor(() => {
			expect(
				screen.getAllByText("ada@example.com")[0]
			).toBeInTheDocument();
		});

		// These fields are only present in ApplicationDetail (not in PersonDetail)
		// and were not rendered before this task — assert they now appear.
		// Use getAllByText[0] to tolerate Portal nodes from prior tests still in DOM.
		expect(
			screen.getAllByText("Building analytical engines")[0]
		).toBeInTheDocument();
		expect(
			screen.getAllByText("To collaborate with brilliant minds")[0]
		).toBeInTheDocument();
	});

	test("application detail drawer shows human-readable labels for vertical, productStage and fundingStage", async () => {
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		const adaCell = within(container).getAllByText("Ada")[0];
		fireEvent.click(adaCell);

		await waitFor(() => {
			expect(
				screen.getAllByText("ada@example.com")[0]
			).toBeInTheDocument();
		});

		// vertical: ["ai", "healthtech"] → "AI / ML, Healthtech" (not raw values)
		expect(
			screen.getAllByText("AI / ML, Healthtech")[0]
		).toBeInTheDocument();
		// productStage: "mvp" → "MVP / early product" (not "mvp")
		expect(
			screen.getAllByText("MVP / early product")[0]
		).toBeInTheDocument();
		// fundingStage: "pre_seed" → "Raised pre-seed" (not "pre_seed")
		expect(screen.getAllByText("Raised pre-seed")[0]).toBeInTheDocument();
	});

	test("application detail drawer body contains no inputs or textareas (read-only)", async () => {
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		const adaCell = within(container).getAllByText("Ada")[0];
		fireEvent.click(adaCell);

		await waitFor(() => {
			expect(
				screen.getAllByText("ada@example.com")[0]
			).toBeInTheDocument();
		});

		// Scope the "no inputs" check to the Ark Dialog content panel so we don't
		// accidentally pick up table inputs or Ark UI internals. Ark renders
		// Dialog.Content with data-scope="dialog" data-part="content".
		const dialogEl = document.querySelector<HTMLElement>(
			'[data-scope="dialog"][data-part="content"]'
		);
		expect(dialogEl).not.toBeNull();
		// Read-only means the PROFILE is display-only. Two always-available
		// controls remain regardless of edit mode: the footer score field and the
		// board-notes composer. Assert those are the only editables.
		const scope = dialogEl ?? document.body;
		// Two: the footer score field and the notes composer. One of them is the
		// composer; the other is the score number input.
		const editables = [...scope.querySelectorAll("input, textarea")];
		expect(editables).toHaveLength(2);
		expect(
			scope.querySelector('[placeholder="Add a note…"]')
		).toBeInTheDocument();
	});

	test("drawer has Prev (disabled) and Next arrows; Next advances to second row", async () => {
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// Click the first data row (Grace, the leading "To score" group) to open
		// the drawer
		const graceCell = within(container).getAllByText("Grace")[0];
		fireEvent.click(graceCell);

		await waitFor(() => {
			expect(
				screen.getAllByText("grace@example.com")[0]
			).toBeInTheDocument();
		});

		// Locate the Drawer's dialog content panel. ApplicationsTab also renders a
		// GuestExpiryProvider which adds a second (closed) Dialog to the DOM, so
		// `document.querySelector` may return the wrong one. Find the one that
		// contains the expected applicant email (i.e. the open drawer).
		// Note: disabled DrawerNav buttons are wrapped in MakeDisablable's Tooltip span,
		// which makes them inaccessible to the standard AT query; use `hidden: true`.
		const allDialogContents = document.querySelectorAll<HTMLElement>(
			'[data-scope="dialog"][data-part="content"]'
		);
		const drawerContent = Array.from(allDialogContents).find((el) =>
			el.textContent.includes("grace@example.com")
		);
		expect(drawerContent).not.toBeUndefined();

		// Both arrows render in the drawer header
		const prevBtn = within(drawerContent ?? document.body).getByRole(
			"button",
			{
				name: /previous/i,
				hidden: true,
			}
		);
		const nextBtn = within(drawerContent ?? document.body).getByRole(
			"button",
			{
				name: /next/i,
				hidden: true,
			}
		);
		// Previous button should be disabled (first row in list)
		expect(prevBtn).toBeDisabled();

		// `onDisplayedRowsChange` fires via a reactive effect once the table renders;
		// wait for it to propagate so the nav has the full list and Next is enabled.
		await waitFor(() => {
			expect(nextBtn).not.toBeDisabled();
		});

		// Click Next → drawer should now show the second displayed row's email
		// ("To score"'s Grace → Queue's Ada, ahead of the Denied group).
		fireEvent.click(nextBtn);
		// Assert inside THIS drawer panel: earlier tests in this file leave their
		// own portalled drawers (also showing Ada) in the document, so a global
		// query would pass whether or not Next actually advanced.
		await waitFor(() => {
			expect(
				within(drawerContent ?? document.body).getByText(
					"ada@example.com"
				)
			).toBeInTheDocument();
		});
	});

	test("pressing X denies the applicant the open drawer is showing", async () => {
		deny.mockClear();
		const { container } = renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// Grace (app3) is "verified" with no score yet — a legal DENY target.
		const graceCell = within(container).getAllByText("Grace")[0];
		fireEvent.click(graceCell);
		await waitFor(() => {
			expect(
				screen.getAllByText("grace@example.com")[0]
			).toBeInTheDocument();
		});

		// The drawer being open is enough on its own to make the scope
		// "active" — no `active` prop needed — and the open drawer's person
		// wins the key over anything else on the roster underneath it.
		fireEvent.keyDown(document, { key: "x" });
		await waitFor(() => {
			expect(deny).toHaveBeenCalledWith("app3");
		});
	});

	test("X does nothing while this tab is not the one on screen and no drawer is open", async () => {
		deny.mockClear();
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} />
		));

		// Nothing opened, `active` left unset (defaults to `false`): a
		// background tab's own action keys must stay dead, or a hidden tab's
		// rows would deny out from under whichever tab is actually showing.
		const grid = screen.getByRole("grid");
		grid.focus();
		fireEvent.keyDown(grid, { key: "ArrowDown" });
		fireEvent.keyDown(document, { key: "x" });
		// `turnDown()` is async (it `await`s a confirm step before the
		// mutation), so a call that DID start would only reach the mock a
		// couple of microtasks later — asserting `not.toHaveBeenCalled()`
		// immediately would pass whether or not `active` correctly blocked
		// anything. A real macrotask tick lets any wrongly-started chain
		// finish before the check, so this actually pins the gate.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(deny).not.toHaveBeenCalled();
	});

	test("X denies the focused row once this tab is marked active", async () => {
		deny.mockClear();
		renderWithSelection((selection) => (
			<ApplicationsTab selection={selection} active />
		));

		const grid = screen.getByRole("grid");
		grid.focus();
		fireEvent.keyDown(grid, { key: "ArrowDown" });
		fireEvent.keyDown(document, { key: "x" });
		await waitFor(() => {
			expect(deny).toHaveBeenCalledTimes(1);
		});
		// Whichever row the ring is on — autofocus puts it on the first displayed
		// row at mount, and the ArrowDown then steps it one on; not asserting a
		// specific id, since the `active` gate is what this test pins.
		expect(["app1", "app2", "app3"]).toContain(deny.mock.calls[0][0]);
	});
});
