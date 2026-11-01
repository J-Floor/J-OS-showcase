// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { Tabs } from "@j-os/design-system";
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

import type { Id } from "../../../../convex/_generated/dataModel";
import {
	PERK_REQUEST_LIST_CAP,
	siteToday,
} from "../../../../convex/lib/perks.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { downloadBlob } from "../../../shared/downloadBlob.ts";

import { capNotice, RequestsTab } from "./RequestsTab.tsx";
import { perkRequestsCsv } from "./toCsv.ts";

// A cap of 3, so three rows stand in for the query's full 2,000.
vi.mock("../../../../convex/lib/perks.ts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../../../convex/lib/perks.ts")
	>()),
	PERK_REQUEST_LIST_CAP: 3,
}));

vi.mock("../../../shared/downloadBlob.ts", () => ({ downloadBlob: vi.fn() }));

// A stub that prints what each row hands the select: here each row has to
// hand it its own request and status, in every grouping.
// RequestsTab.status.test.tsx drives the real select in this table.
vi.mock("../PerkRequestStatusSelect.tsx", () => ({
	PerkRequestStatusSelect: (props: { requestId: string; status: string }) => (
		<span data-testid="status-select">
			{props.requestId}:{props.status}
		</span>
	),
}));

function request(id: string, fields: Partial<PerkRequestRow>): PerkRequestRow {
	return {
		_id: id as Id<"perkRequests">,
		perkId: "perk1" as Id<"perks">,
		personId: "person1" as Id<"people">,
		requesterName: "Ada Example",
		requesterEmail: "ada@example.com",
		ventureName: "Acme",
		perkTitle: "Cloud credits",
		partner: "Alpha Labs",
		contactName: "Anna Board",
		requestedAt: Date.UTC(2026, 9, 20, 9),
		status: "requested",
		statusAt: Date.UTC(2026, 9, 20, 9),
		...fields,
	};
}

// Newest first, as the query sends them (r1 newest, r5 oldest). The newest
// request is for the perk and from the person that sort last by name, so
// name order and newest-first order disagree. Ada has two requests (r2 and
// r3, one per perk), both still Requested: a status group and a requester
// group of two rows each, to show the order inside a group.
const ROWS = [
	request("r1", {
		perkId: "perk2" as Id<"perks">,
		requesterName: "Dan Fixture",
		requesterEmail: "dan@example.com",
		perkTitle: "Design seats",
		partner: "Bravo Labs",
		// 23:30 UTC on 31 October: already 1 November in Zurich.
		requestedAt: Date.UTC(2026, 9, 31, 23, 30),
		status: "contacted",
	}),
	request("r2", {
		perkId: "perk2" as Id<"perks">,
		perkTitle: "Design seats",
		partner: "Bravo Labs",
		requestedAt: Date.UTC(2026, 9, 25, 9),
	}),
	request("r3", { requestedAt: Date.UTC(2026, 9, 20, 9) }),
	request("r4", {
		// Typed in lower case: it still sorts under B, not after Z.
		requesterName: "ben Sample",
		requesterEmail: "ben@example.com",
		requestedAt: Date.UTC(2026, 9, 5, 9),
		status: "declined",
	}),
	request("r5", {
		perkId: "perk2" as Id<"perks">,
		requesterName: "Cara Demo",
		requesterEmail: "cara@example.com",
		perkTitle: "Design seats",
		partner: "Bravo Labs",
		requestedAt: Date.UTC(2026, 8, 10, 9),
		status: "granted",
	}),
];

const [rows, setRows] = createSignal<PerkRequestRow[] | undefined>(ROWS);
// The server's own word that its read stopped at the cap: the joined rows
// can number fewer, once requests whose perk or requester is gone drop out.
const [capped, setCapped] = createSignal(false);

vi.mock("../../../shared/data/useQuery.ts", () => ({
	useQuery: () => ({
		data: () => {
			const requests = rows();
			return requests && { requests, capped: capped() };
		},
		error: () => {},
	}),
}));

afterEach(() => {
	cleanup();
	setRows(ROWS);
	setCapped(false);
	vi.mocked(downloadBlob).mockReset();
});

function renderTab() {
	const history = createMemoryHistory();
	history.set({ value: "/perks?tab=requests", scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route
				path="*"
				component={() => (
					<Tabs.Root value="requests">
						<Tabs.Bar>
							<Tabs.List>
								<Tabs.Trigger value="requests">
									Requests
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Bar>
						<Tabs.Content value="requests">
							<RequestsTab />
						</Tabs.Content>
					</Tabs.Root>
				)}
			/>
		</MemoryRouter>
	));
	return history;
}

/** The groups on screen, top to bottom, by the value each one groups. */
function groupKeys(): (string | null)[] {
	return Array.from(document.querySelectorAll("[data-group-key]"), (row) =>
		row.getAttribute("data-group-key")
	);
}

/** The requester cells, top to bottom. */
function requesters(): (string | null)[] {
	return screen
		.getAllByText(/^(Ada Example|ben Sample|Cara Demo|Dan Fixture)$/)
		.map((cell) => cell.textContent);
}

/** What each row hands its status select, top to bottom: the row order by
 *  request id, which tells Ada's two rows apart. */
function rowSelects(): (string | null)[] {
	return screen
		.getAllByTestId("status-select")
		.map((select) => select.textContent);
}

function groupBy(label: string) {
	fireEvent.click(screen.getByRole("radio", { name: label }));
}

test("groups by status by default, in the order a request moves", async () => {
	renderTab();
	await waitFor(() => {
		expect(groupKeys()).toEqual([
			"requested",
			"contacted",
			"granted",
			"declined",
		]);
	});
	expect(
		screen.getByRole("button", { name: "Requested (2)" })
	).toBeInTheDocument();
});

test("Month regroups by Zurich calendar month, newest first, rows newest first within", async () => {
	renderTab();
	groupBy("Month");
	await waitFor(() => {
		expect(groupKeys()).toEqual([
			"November 2026",
			"October 2026",
			"September 2026",
		]);
	});
	expect(requesters()).toEqual([
		"Dan Fixture",
		"Ada Example",
		"Ada Example",
		"ben Sample",
		"Cara Demo",
	]);
});

test("Perk groups alphabetically, even when a later perk has the newest request", async () => {
	renderTab();
	groupBy("Perk");
	await waitFor(() => {
		expect(groupKeys()).toEqual([
			"Alpha Labs · Cloud credits",
			"Bravo Labs · Design seats",
		]);
	});
	expect(requesters()).toEqual([
		"Ada Example",
		"ben Sample",
		"Dan Fixture",
		"Ada Example",
		"Cara Demo",
	]);
});

test("Requester groups alphabetically by name, whatever the case it was typed in", async () => {
	renderTab();
	groupBy("Requester");
	await waitFor(() => {
		expect(groupKeys()).toEqual([
			"Ada Example",
			"ben Sample",
			"Cara Demo",
			"Dan Fixture",
		]);
	});
});

test("inside a group the newest request comes first, whatever order the rows arrive in", async () => {
	// Oldest first: the reverse of the query's order. Only the table's own
	// sort can then put Ada's r2 (25 October) above her r3 (20 October), in
	// her status group and in her requester group alike.
	setRows([...ROWS].reverse());
	renderTab();
	await waitFor(() => {
		expect(rowSelects()).toEqual([
			"r2:requested",
			"r3:requested",
			"r1:contacted",
			"r5:granted",
			"r4:declined",
		]);
	});
	groupBy("Requester");
	await waitFor(() => {
		expect(groupKeys()[0]).toBe("Ada Example");
	});
	expect(rowSelects()).toEqual([
		"r2:requested",
		"r3:requested",
		"r4:declined",
		"r5:granted",
		"r1:contacted",
	]);
});

test("every row keeps the status select for its own request, in every grouping", async () => {
	renderTab();
	// The group each switch puts first, so the check below runs on the
	// regrouped table.
	const firstGroup = {
		Perk: "Alpha Labs · Cloud credits",
		Requester: "Ada Example",
		Month: "November 2026",
		Status: "requested",
	};
	for (const [label, first] of Object.entries(firstGroup)) {
		groupBy(label);
		await waitFor(() => {
			expect(groupKeys()[0]).toBe(first);
		});
		const selects = rowSelects();
		expect(selects).toHaveLength(ROWS.length);
		expect(new Set(selects)).toEqual(
			new Set([
				"r1:contacted",
				"r2:requested",
				"r3:requested",
				"r4:declined",
				"r5:granted",
			])
		);
	}
});

test("a row opens its perk's sheet as a peek, over the Requests tab", async () => {
	const history = renderTab();
	fireEvent.click(await screen.findByText("ben Sample"));
	await waitFor(() => {
		expect(history.get()).toContain("open=perk%3Aperk1");
	});
	expect(history.get()).toContain("tab=requests");
	// Not the Perks tab's own param, which would switch tabs to open it.
	expect(history.get()).not.toContain("perk=perk1");
});

test("a click on the status select opens nothing", async () => {
	const history = renderTab();
	const [select] = await screen.findAllByTestId("status-select");
	fireEvent.click(select);
	// Give a stray navigation the tick it would take to land.
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	expect(history.get()).not.toContain("open=");
});

test("Download CSV saves every loaded row as today's file, whatever the grouping", async () => {
	renderTab();
	groupBy("Month");
	fireEvent.click(
		await screen.findByRole("button", { name: "Download CSV" })
	);
	expect(downloadBlob).toHaveBeenCalledOnce();
	const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
	expect(filename).toBe(`perk-requests-${siteToday(Date.now())}.csv`);
	expect(blob.type).toBe("text/csv;charset=utf-8");
	// Bytes, not text: a text decoder may drop the BOM the file starts with.
	expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
		new TextEncoder().encode(perkRequestsCsv(ROWS))
	);
});

test("an empty list says so, and has nothing to download", async () => {
	setRows([]);
	renderTab();
	expect(await screen.findByText("No requests yet")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();
});

test("a capped list says older requests are not shown, even with fewer rows than the cap", async () => {
	// The read stopped at the cap, and the join dropped a request whose
	// requester is gone: one row short, yet older requests exist.
	setRows(ROWS.slice(0, PERK_REQUEST_LIST_CAP - 1));
	setCapped(true);
	renderTab();
	expect(
		await screen.findByText(
			`Showing the newest ${PERK_REQUEST_LIST_CAP} requests.`
		)
	).toBeInTheDocument();
	setCapped(false);
	await waitFor(() => {
		expect(screen.queryByText(/Showing the newest/)).toBeNull();
	});
});

test("a full page that is not capped says nothing about older requests", async () => {
	// Exactly as many rows as the cap, every one there is.
	setRows(ROWS.slice(0, PERK_REQUEST_LIST_CAP));
	renderTab();
	expect(await screen.findAllByTestId("status-select")).toHaveLength(
		PERK_REQUEST_LIST_CAP
	);
	expect(screen.queryByText(/Showing the newest/)).toBeNull();
});

test("the cap notice reads the real cap with its thousands separator", () => {
	expect(capNotice(2000)).toBe("Showing the newest 2,000 requests.");
});

test("the group-by switch lays its options out in a row", async () => {
	renderTab();
	const group = await screen.findByRole("radiogroup", { name: "Group by" });
	expect(group).toHaveAttribute("data-orientation", "horizontal");
});
