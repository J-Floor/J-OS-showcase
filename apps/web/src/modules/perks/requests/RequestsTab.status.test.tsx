// @vitest-environment happy-dom
import { Tabs } from "@j-os/design-system";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";

import { RequestsTab } from "./RequestsTab.tsx";

function request(id: string, fields: Partial<PerkRequestRow>): PerkRequestRow {
	return {
		_id: id as Id<"perkRequests">,
		perkId: "perk1" as Id<"perks">,
		personId: "person1" as Id<"people">,
		requesterName: "Ada Example",
		requesterEmail: "ada@example.com",
		perkTitle: "Cloud credits",
		partner: "Alpha Labs",
		requestedAt: Date.UTC(2026, 9, 20, 9),
		status: "requested",
		statusAt: Date.UTC(2026, 9, 20, 9),
		...fields,
	};
}

// The real status select, in the real table: no mock of the select. The
// backend is stubbed at `convex-solidjs`. Convex's `api` refs are proxies
// that aren't `===`-stable, so both hooks route by `getFunctionName`.
const backend = vi.hoisted(() => ({
	setPerkRequestStatus: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	// Any other mutation: none is expected.
	otherMutation: vi.fn<(args: unknown) => Promise<null>>(() =>
		Promise.resolve(null)
	),
	// What `listPerkRequests` answers, as a signal so a test can push a
	// live update.
	requests: (): unknown[] => [],
}));

const DAN = request("r1", {
	requesterName: "Dan Fixture",
	requesterEmail: "dan@example.com",
	requestedAt: Date.UTC(2026, 9, 25, 9),
	status: "granted",
});
const BEN = request("r2", {
	requesterName: "Ben Sample",
	requesterEmail: "ben@example.com",
});
const [requests, setRequests] = createSignal<PerkRequestRow[]>([DAN, BEN]);
backend.requests = requests;

vi.mock("convex-solidjs", () => ({
	useQuery: (reference: unknown) => {
		const name = getFunctionName(
			reference as Parameters<typeof getFunctionName>[0]
		);
		return {
			data: () =>
				name === "perkRequests:listPerkRequests"
					? { requests: backend.requests(), capped: false }
					: undefined,
			error: () => {},
			isLoading: () => false,
		};
	},
	useMutation: (reference: unknown) => {
		const name = getFunctionName(
			reference as Parameters<typeof getFunctionName>[0]
		);
		return {
			mutateAsync:
				name === "perkRequests:setPerkRequestStatus"
					? backend.setPerkRequestStatus
					: backend.otherMutation,
		};
	},
}));

afterEach(() => {
	cleanup();
	setRequests([DAN, BEN]);
	vi.clearAllMocks();
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
							<RequestsTab active={() => true} />
						</Tabs.Content>
					</Tabs.Root>
				)}
			/>
		</MemoryRouter>
	));
	return history;
}

test("picking a status in a row saves it for that row's request, and opens nothing", async () => {
	const history = renderTab();
	const requester = await screen.findByText("Ben Sample");
	const row = requester.closest("tr");
	if (!row) throw new Error("Ben Sample's row is not a table row");
	fireEvent.click(within(row).getByRole("combobox", { name: "Status" }));
	fireEvent.click(await screen.findByRole("option", { name: "Contacted" }));
	await waitFor(() => {
		expect(backend.setPerkRequestStatus).toHaveBeenCalledOnce();
	});
	expect(backend.setPerkRequestStatus.mock.calls[0][0]).toStrictEqual({
		requestId: "r2",
		status: "contacted",
	});
	expect(backend.otherMutation).not.toHaveBeenCalled();
	// The cell is `disableRowClick`: neither the click that opened the picker
	// nor the pick itself reached the row, which would open the perk's peek.
	expect(history.get()).not.toContain("open=");
});

/** The table's rows top to bottom: each group header by its key, each
 *  request row by its requester. */
function tableOrder(): string[] {
	return Array.from(
		document.querySelectorAll("tr"),
		(row) =>
			row.getAttribute("data-group-key") ??
			["Ben Sample", "Dan Fixture"].find((name) =>
				row.textContent.includes(name)
			)
	).filter((entry) => entry !== undefined);
}

test("a live status change moves the row to its new group and its picker to the new status, in the same table", async () => {
	renderTab();
	await screen.findByText("Ben Sample");
	expect(tableOrder()).toEqual([
		"requested",
		"Ben Sample",
		"granted",
		"Dan Fixture",
	]);
	const table = screen.getByRole("grid");
	// The server's answer to a status change: every row a new object.
	setRequests([{ ...DAN }, { ...BEN, status: "contacted" }]);
	await waitFor(() => {
		expect(tableOrder()).toEqual([
			"contacted",
			"Ben Sample",
			"granted",
			"Dan Fixture",
		]);
	});
	const row = screen.getByText("Ben Sample").closest("tr");
	if (!row) throw new Error("Ben Sample's row is not a table row");
	expect(
		within(row).getByRole("combobox", { name: "Status" })
	).toHaveTextContent("Contacted");
	// Updated in place: the same table, not a new one.
	expect(screen.getByRole("grid")).toBe(table);
	expect(table.isConnected).toBe(true);
});
