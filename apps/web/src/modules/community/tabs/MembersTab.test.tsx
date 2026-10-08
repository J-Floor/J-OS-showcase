// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { ConfirmProvider } from "../../../shared/confirm.tsx";
import type { MemberRow } from "../columns/memberColumns.tsx";

// Ark's Dialog (the Drawer) mounts a Portal into document.body; unmount it
// between tests so nodes don't accumulate and slow later queries under load.
afterEach(cleanup);

// jsdom gaps that ark-ui / the design-system Table touch at mount.
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

const {
	kickOutMock,
	upgradeToMemberMock,
	extendWindowMock,
	setRoleMock,
	grantCoreMock,
	revokeCoreMock,
	promoteToBoardMock,
	reAdmitMock,
	markLeftMock,
} = vi.hoisted(() => ({
	kickOutMock: vi.fn(() => Promise.resolve()),
	upgradeToMemberMock: vi.fn(() => Promise.resolve()),
	extendWindowMock: vi.fn(() => Promise.resolve()),
	setRoleMock: vi.fn(() => Promise.resolve()),
	grantCoreMock: vi.fn(() => Promise.resolve()),
	revokeCoreMock: vi.fn(() => Promise.resolve()),
	promoteToBoardMock: vi.fn(() => Promise.resolve()),
	reAdmitMock: vi.fn(() => Promise.resolve()),
	markLeftMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("../actions/triage.ts", () => ({
	useTriage: () => ({
		kickOut: kickOutMock,
		upgradeToMember: upgradeToMemberMock,
		extendWindow: extendWindowMock,
		setRole: setRoleMock,
		grantCore: grantCoreMock,
		revokeCore: revokeCoreMock,
		promoteToBoard: promoteToBoardMock,
		reAdmit: reAdmitMock,
		markLeft: markLeftMock,
	}),
}));

// p1 and p3 are live (member.onboarding): each keeps a per-row Change role +
// Kick out button, and both are rows the batch loop actually reaches — two
// live rows, not one, so a regression that stopped `runBatch` after the first
// id would still show up here. p2 is a former member (former.active):
// `memberGroup` buckets it "kicked_out", which the batch bar's `liveRows()`
// filters out of Kick out, and it lands in a different table group than
// p1/p3 — the fixture for the "stays in Members" property below.
//
// Group order (board, admin, core, member, not_onboarded, kicked_out) means
// p1 and p3 (both "not_onboarded") render before p2 ("kicked_out"), in their
// relative array order — i.e. on screen: Ada, Grace, then Alan.
const rows = [
	{
		_id: "p1",
		_creationTime: 0,
		firstName: "Ada",
		lastName: "Lovelace",
		email: "ada@example.com",
		tier: "member",
		stage: "onboarding",
		// No `projectName` on this row at all — mirrors a person imported from
		// Notion, for whom only `venture.name` was ever written.
		venture: { name: "Engine Co" },
		status: {
			headline: "Member · onboarding",
			tone: "warning",
			flags: [],
			facts: [],
			boardTasks: [],
			since: "",
		},
	},
	{
		_id: "p3",
		_creationTime: 0,
		firstName: "Grace",
		lastName: "Hopper",
		email: "grace@example.com",
		tier: "member",
		stage: "onboarding",
		status: {
			headline: "Member · onboarding",
			tone: "warning",
			flags: [],
			facts: [],
			boardTasks: [],
			since: "",
		},
	},
	{
		_id: "p2",
		_creationTime: 0,
		firstName: "Alan",
		lastName: "Turing",
		email: "alan@example.com",
		tier: "former",
		formerOf: "member",
		stage: "active",
		status: {
			headline: "Former · active",
			tone: "neutral",
			flags: [],
			facts: [],
			boardTasks: [],
			since: "",
		},
	},
] as unknown as MemberRow[];

/** Flip to simulate the roster query still loading (`data()` undefined). */
let membersLoading = false;
afterEach(() => {
	membersLoading = false;
});

vi.mock("../data/useMembers.ts", () => ({
	useMembers: () => ({
		data: () => (membersLoading ? undefined : rows),
	}),
}));

// memberColumns now calls useQuery(api.people.getAgreementUrl, ...) per row.
// Stub convex-solidjs so tests don't need a ConvexProvider.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => undefined, isLoading: () => true }),
	// `AgreementButton` resolves the document URL on click instead of holding a
	// per-row subscription, so the rows now need the raw client too.
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
	useMutation: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		data: () => undefined,
		error: () => undefined,
		isLoading: () => false,
		reset: vi.fn(),
	})),
}));

import { MembersTab } from "./MembersTab.tsx";
import type { PersonSelection } from "./TabProps.ts";
import { openPanel, renderWithSelection } from "./testSelection.tsx";

test("selecting all three rows and clicking Kick out calls kickOut for both live rows, not the former one", async () => {
	kickOutMock.mockClear();
	renderWithSelection((selection) => <MembersTab selection={selection} />);

	const checkboxes = screen.getAllByRole("checkbox");
	// index 0 is the select-all header checkbox; 1-3 are the data rows, in
	// group order: Ada (p1) and Grace (p3) — both "not_onboarded" — render
	// before Alan (p2, former/"kicked_out").
	fireEvent.click(checkboxes[1]);
	fireEvent.click(checkboxes[2]);
	fireEvent.click(checkboxes[3]);

	// "Kick out" names several controls: a per-row IconButton on each live row
	// and the batch-bar button. Scope to the batch bar — identified by its unique
	// "Clear selection" button — so we click the batch action (which loops the
	// selected rows), not a single row's button. Names are matched with a regex
	// because every Button keeps an always-mounted Spinner whose "Loading" label
	// is appended to the computed accessible name (e.g. "Clear selection Loading").
	const clear = await screen.findByRole("button", {
		name: /clear selection/i,
	});
	const batchBar = clear.parentElement!;
	const kickButton = within(batchBar).getByRole("button", {
		name: /kick out/i,
	});
	fireEvent.click(kickButton);

	// `memberGroup` buckets p2 (former) as "kicked_out", and the batch bar's
	// `liveRows()` filters that bucket out of Kick out — so the loop runs over
	// BOTH live rows (p1, p3), which is what actually exercises the loop: a
	// regression that stopped `runBatch` after its first id would still pass a
	// single-row assertion but fails this one.
	await waitFor(() => {
		expect(kickOutMock).toHaveBeenCalledTimes(2);
	});
	expect(kickOutMock).toHaveBeenCalledWith("p1");
	expect(kickOutMock).toHaveBeenCalledWith("p3");
	expect(kickOutMock).not.toHaveBeenCalledWith("p2");
});

test("MemberManagement: clicking a row opens the drawer showing that person's email", async () => {
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	// Click the first name cell in the first data row.
	// Use getAllByText to handle any DOM leftovers from prior renders in the file.
	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	await waitFor(() => {
		expect(screen.getByText("ada@example.com")).toBeInTheDocument();
	});
});

test("MemberManagement: drawer body contains no inputs or textareas (read-only)", async () => {
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	// Wait for the panel to be OPEN, not merely for the person's details to be
	// somewhere in the document: a drawer that mounts shut is held closed for
	// one task, so zag sees a real false-to-true change (see Drawer).
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});

	// Scope the "no inputs" check to the Ark Dialog content panel so we don't
	// accidentally pick up inputs in the table (e.g. filter inputs). Ark renders
	// Dialog.Content with data-scope="dialog" data-part="content".
	const dialogEl = openPanel();
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

test("MemberManagement: drawer has Prev (disabled) and Next arrows; Next advances to second row", async () => {
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	// Click the first data row to open the drawer
	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);

	// The panel, not merely the person's details: a drawer that mounts shut is
	// held closed for one task so zag sees a real false-to-true change (see
	// Drawer), and its header does not exist until it is actually open.
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});

	// Locate the dialog content panel; the Drawer uses a plain <header> inside it
	// (not Ark's Dialog.Header), so we scope to the content panel and find the
	// DrawerNav buttons (Previous / Next) within it.
	// Note: disabled DrawerNav buttons are wrapped in MakeDisablable's Tooltip span,
	// which makes them inaccessible to the standard AT query; use `hidden: true`.
	const dialogContent = openPanel();
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

	// Click Next → drawer should now show the second row's email. Second in
	// display order is Grace (p3): both p1 and p3 are "not_onboarded", ahead of
	// Alan's "kicked_out" group.
	fireEvent.click(nextBtn);
	await waitFor(() => {
		expect(screen.getAllByText("grace@example.com")[0]).toBeInTheDocument();
	});
});

test("MemberManagement: per-row Change role icon opens the role dialog with role options", async () => {
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	// Find the "Change role" icon buttons in the data rows' actions column and
	// click the first one. Grouping puts p1 (member.onboarding, "not_onboarded")
	// ahead of p2 (former, "kicked_out"), so this is p1's button.
	// legalEvents("member.onboarding") = ONBOARDING_PROGRESSED, KICK_OUT,
	// MARK_LEFT, SET_ROLE → core/board/admin (via SET_ROLE) + left + kick = 5
	// moves ("member" is suppressed as the tier they already hold).
	const changeRoleBtns = within(container).getAllByRole("button", {
		name: /change role/i,
	});
	fireEvent.click(changeRoleBtns[0]);

	// The dialog (unmountOnExit) mounts its content — incl. the Segment's five
	// role options — asynchronously on open; wait for them to render.
	await waitFor(() => {
		expect(
			document.querySelectorAll(
				'[data-scope="segment-group"][data-part="item"]'
			).length
		).toBeGreaterThanOrEqual(5);
	});
});

test("MemberManagement: selecting rows and clicking batch Change role opens the role dialog", async () => {
	renderWithSelection((selection) => <MembersTab selection={selection} />);

	// Ada (p1, member.onboarding) and Alan (p2, former.active) specifically —
	// index 2 is Grace (p3, also member.onboarding), whose intersection with
	// Ada would be a no-op (same state) rather than the degraded-to-SET_ROLE
	// scenario this test documents.
	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);
	fireEvent.click(checkboxes[3]);

	// Scope to the batch bar (identified by its unique "Clear selection" button).
	const clear = await screen.findByRole("button", {
		name: /clear selection/i,
	});
	const batchBar = clear.parentElement!;
	const changeRoleBtn = within(batchBar).getByRole("button", {
		name: /change role/i,
	});
	fireEvent.click(changeRoleBtn);

	// ChangeRoleDialog (unmountOnExit) mounts its content asynchronously on open.
	// legalEvents("member.onboarding") ∩ legalEvents("former.active") = { SET_ROLE }
	// only, which still yields all four role destinations ("member" is not
	// suppressed here, because the former row isn't a member).
	await waitFor(() => {
		expect(
			document.querySelectorAll(
				'[data-scope="segment-group"][data-part="item"]'
			).length
		).toBeGreaterThanOrEqual(4);
	});
});

test("MemberManagement: batch Kick out button is still present after the Change role refactor", async () => {
	renderWithSelection((selection) => <MembersTab selection={selection} />);

	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);

	const clear = await screen.findByRole("button", {
		name: /clear selection/i,
	});
	const batchBar = clear.parentElement!;
	const kickOutBtn = within(batchBar).getByRole("button", {
		name: /kick out/i,
	});
	expect(kickOutBtn).toBeInTheDocument();
});

test("MemberManagement: per-row Kick out icon is still present after the Change role refactor", () => {
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	// The "Kick out" icon button should still exist in the per-row actions area.
	// There will be one per non-kicked-out row; just confirm at least one exists.
	const kickOutBtns = within(container).getAllByRole("button", {
		name: /kick out/i,
	});
	expect(kickOutBtns.length).toBeGreaterThan(0);
});

test("groups a former member under Kicked out, and does not restate that in the row", () => {
	renderWithSelection((selection) => <MembersTab selection={selection} />);
	// p2 (tier: "former", formerOf: "member") buckets under the "Kicked out"
	// group heading — placement follows the LAST tier, so a former member stays
	// in the Members tab rather than disappearing or moving tab.
	expect(
		screen.getByRole("button", { name: /Kicked out/ })
	).toBeInTheDocument();
	// And the rows themselves stay quiet. Every fixture here carries
	// `flags: []`, so the Flags column renders nothing — the old Status column
	// repeated each row's tier and stage under a group header that had just
	// said the same thing, which is what taught the board to skip the column.
	expect(screen.queryByText("Member · onboarding")).toBeNull();
	expect(screen.queryByText("Former · active")).toBeNull();
});

test("a flag on a row IS rendered — the column is quiet, not dead", () => {
	// Same table, one row given something worth saying. Without this the test
	// above passes just as well against a column that renders nothing ever.
	const original = rows[0].status;
	rows[0].status = {
		...original,
		flags: [{ id: "agreement_missing", variant: "member" }],
	};
	try {
		renderWithSelection((selection) => (
			<MembersTab selection={selection} />
		));
		expect(
			screen.getByText("Member agreement not signed")
		).toBeInTheDocument();
	} finally {
		rows[0].status = original;
	}
});

test("Venture column renders venture.name for a person with no projectName (the import's shape)", () => {
	renderWithSelection((selection) => <MembersTab selection={selection} />);
	expect(screen.getByText("Engine Co")).toBeInTheDocument();
});

test("opens a person's drawer when the URL named them", async () => {
	// Global search links to `?person=<id>`; the page's selection reads it and
	// hands it down. Without this the link lands on the tab and the board still
	// has to find the row by eye.
	renderWithSelection((selection) => <MembersTab selection={selection} />, {
		path: "/community?person=p1",
	});
	await waitFor(() => {
		expect(screen.getByText("ada@example.com")).toBeInTheDocument();
	});
});

test("a deep link opened while the roster loads shows the drawer skeleton", async () => {
	// The deep-link id can arrive before the roster's query has answered, so
	// the drawer must open on the loading skeleton, not a blank name.
	membersLoading = true;
	renderWithSelection(
		(selection) => <MembersTab selection={selection} active />,
		{ path: "/community?person=p1" }
	);
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	// Shaped like the loaded PersonDetail, not the generic bars.
	expect(screen.getByText("Email")).toBeInTheDocument();
});

test("a person from another roster opens no drawer here", async () => {
	// All three tabs share one selection and stay mounted, so a tab whose loaded
	// roster lacks the person must stay shut — and must not shimmer forever
	// waiting for a row that is never coming.
	renderWithSelection((selection) => <MembersTab selection={selection} />, {
		path: "/community?person=missing",
	});
	// Wait for the drawer's panel to exist, then judge it: a bare timer would
	// race the Drawer's own mount timer.
	await waitFor(() => {
		expect(
			document.querySelector('[data-scope="dialog"][data-part="content"]')
		).not.toBeNull();
	});
	expect(openPanel()).toBeNull();
	expect(document.querySelectorAll("[data-drawer-skeleton]").length).toBe(0);
});

test("opening a row from the table puts them in the URL", async () => {
	// Opening someone from the TABLE has to put them in the address bar, or the
	// drawer cannot be linked to or reloaded into.
	const { container, url } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));
	expect(url()).not.toContain("person=");

	fireEvent.click(within(container).getAllByText("Ada")[0]);
	await waitFor(() => {
		expect(url()).toContain("person=p1");
	});
});

test("closes its drawer when the person leaves the URL", async () => {
	// The page closes the selection when a tab is picked. A drawer left open
	// reappears stacked under the next one.
	let selection!: PersonSelection;
	renderWithSelection(
		(s) => {
			selection = s;
			return <MembersTab selection={s} />;
		},
		{ path: "/community?person=p1" }
	);
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});

	selection.close(false);
	await waitFor(() => {
		expect(openPanel()).toBeNull();
	});
});

test("batch Kick out's confirm names the count that will actually be affected, not the count selected", async () => {
	// p1 and p3 are live ("not_onboarded"); p2 is former ("kicked_out") and the
	// kick-out descriptor's `can` excludes it, same as the per-row button. All
	// three get selected, so the dialog must say 2 — not 3 — or the board is
	// told it is about to affect someone the click will not touch.
	kickOutMock.mockClear();
	renderWithSelection((selection) => (
		<ConfirmProvider>
			<MembersTab selection={selection} />
		</ConfirmProvider>
	));

	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);
	fireEvent.click(checkboxes[2]);
	fireEvent.click(checkboxes[3]);

	const clear = await screen.findByRole("button", {
		name: /clear selection/i,
	});
	const batchBar = clear.parentElement!;
	const kickButton = within(batchBar).getByRole("button", {
		name: /kick out/i,
	});
	fireEvent.click(kickButton);

	await waitFor(() => {
		expect(
			screen.getByText(/Revoke access for 2 person\(s\)\?/)
		).toBeInTheDocument();
	});
	expect(screen.queryByText(/Revoke access for 3 person\(s\)\?/)).toBeNull();
});

test("pressing K kicks out the person the open drawer is showing", async () => {
	kickOutMock.mockClear();
	const { container } = renderWithSelection((selection) => (
		<MembersTab selection={selection} />
	));

	// Ada (p1) is "member.onboarding" → group "not_onboarded", not
	// "kicked_out" — a legal Kick out target.
	const adaCell = within(container).getAllByText("Ada")[0];
	fireEvent.click(adaCell);
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});

	// The drawer being open is enough on its own to make the scope "active"
	// — no `active` prop needed — and the open drawer's person wins the key
	// over anything else on the roster underneath it.
	fireEvent.keyDown(document, { key: "k" });
	await waitFor(() => {
		expect(kickOutMock).toHaveBeenCalledWith("p1");
	});
});

test("K does nothing while this tab is not the one on screen and no drawer is open", async () => {
	kickOutMock.mockClear();
	renderWithSelection((selection) => <MembersTab selection={selection} />);

	// Nothing opened, `active` left unset (defaults to `false`): a
	// background tab's own action keys must stay dead, or a hidden tab's
	// rows would kick people out from under whichever tab is actually
	// showing.
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	fireEvent.keyDown(document, { key: "k" });
	// `kickOut()` is async (it `await`s a confirm step before the mutation),
	// so a call that DID start would only reach the mock a couple of
	// microtasks later — asserting `not.toHaveBeenCalled()` immediately
	// would pass whether or not `active` correctly blocked anything. A real
	// macrotask tick lets any wrongly-started chain finish before the check,
	// so this actually pins the gate rather than racing it.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(kickOutMock).not.toHaveBeenCalled();
});

test("K kicks out the focused row once this tab is marked active", async () => {
	kickOutMock.mockClear();
	renderWithSelection((selection) => (
		<MembersTab selection={selection} active />
	));

	// `autofocusFirstRow` puts the ring on the first displayed row at mount, so no
	// keypress is needed to reach it. Members has no `initialColumnSorting`, so the
	// displayed order is the fixture's own (p1, p3, p2) — the ring starts on p1
	// (Ada).
	// The table claims focus once it is live, and the ring (and so the focused
	// row the letter acts on) shows only while focus is within it.
	await waitFor(() => {
		expect(screen.getByRole("grid")).toHaveFocus();
	});
	fireEvent.keyDown(document, { key: "k" });
	await waitFor(() => {
		expect(kickOutMock).toHaveBeenCalledWith("p1");
	});
});
