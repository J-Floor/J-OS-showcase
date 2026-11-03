// @vitest-environment happy-dom
import { Table, type JfColumnDefinition } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { PersonRow } from "../../../../convex/people.ts";
import { BatchActionButton } from "../../../shared/actions/BatchActionButton.tsx";
import type { BatchableAction } from "../../../shared/actions/batchOf.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";

import { RosterTab } from "./RosterTab.tsx";
import { checkRows, openPanel, renderWithSelection } from "./testSelection.tsx";

afterEach(cleanup);

// The sheet's PersonDetail opens Convex subscriptions and mutations; stub the
// client so the scaffold mounts without a ConvexProvider.
vi.mock("convex-solidjs", () => ({
	useQuery: () => ({ data: () => {}, isLoading: () => true }),
	useConvexClient: () => ({ query: vi.fn(() => Promise.resolve(null)) }),
	useMutation: vi.fn(() => ({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		data: () => {},
		error: () => {},
		isLoading: () => false,
		reset: vi.fn(),
	})),
}));

function person(id: string, firstName: string): PersonRow {
	return {
		_id: id,
		_creationTime: 0,
		firstName,
		lastName: "Tester",
		email: `${id}@example.com`,
		tier: "member",
		stage: "active",
		status: {
			tier: "member",
			stage: "active",
			tone: "success",
			flags: [],
			facts: [],
			boardTasks: [],
			sinceDays: 1,
		},
	} as unknown as PersonRow;
}

const rows = [person("p1", "Ada"), person("p2", "Grace")];

function columns(): JfColumnDefinition<PersonRow>[] {
	return [
		{
			id: "group",
			header: "Group",
			dataType: "enum",
			enumOptions: [{ value: "all", label: "All" }],
			accessorFn: () => "all",
		},
		{ accessorKey: "firstName", header: "First name", dataType: "string" },
	];
}

test("footerLead renders in the sheet footer with the open person and follows the sheet's paging", async () => {
	renderWithSelection(
		(selection) => (
			<RosterTab.Root<PersonRow>
				tab={{ selection, active: true }}
				data={() => rows}
				columns={columns}
				groupBy="group"
				actions={() => []}
				scope="members"
				footerLead={(open) => (
					<p data-testid="lead">{open().firstName}</p>
				)}
			/>
		),
		{ path: "/community?person=p1" }
	);
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	const panel = openPanel()!;
	const lead = within(panel).getByTestId("lead");
	expect(lead).toHaveTextContent("Ada");

	// Prev/next step through the rows on screen once the table has reported them.
	const next = within(panel).getByRole("button", {
		name: /next/i,
		hidden: true,
	});
	await waitFor(() => {
		expect(next).not.toBeDisabled();
	});
	fireEvent.click(next);
	await waitFor(() => {
		expect(within(panel).getByTestId("lead")).toHaveTextContent("Grace");
	});
	// Updated in place: a remount would cancel a morph in flight.
	expect(within(panel).getByTestId("lead")).toBe(lead);
});

test("no footerLead: the sheet footer carries only the tab's own buttons", async () => {
	renderWithSelection(
		(selection) => (
			<RosterTab.Root<PersonRow>
				tab={{ selection, active: true }}
				data={() => rows}
				columns={columns}
				groupBy="group"
				actions={() => []}
				scope="members"
			/>
		),
		{ path: "/community?person=p1" }
	);
	await waitFor(() => {
		expect(openPanel()).not.toBeNull();
	});
	expect(within(openPanel()!).queryByTestId("lead")).toBeNull();
});

test("a key pressed with rows checked runs its action's batch once, then unchecks the rows", async () => {
	const batches: string[][] = [];
	const kick: ActionDescriptor<PersonRow> = {
		id: "kick",
		label: "Kick out",
		icon: "block",
		hotkey: "K",
		can: () => true,
		run: () => {},
		runBatch: (people) => {
			batches.push(people.map((row) => row._id));
			return Promise.resolve({ refused: false });
		},
	};

	renderWithSelection((selection) => (
		<RosterTab.Root<PersonRow>
			tab={{ selection, active: true }}
			data={() => rows}
			columns={columns}
			groupBy="group"
			actions={() => [kick]}
			scope="members"
		>
			<Table.BatchActions />
		</RosterTab.Root>
	));

	await checkRows(1, 2);
	fireEvent.keyDown(document.body, { key: "k" });

	await waitFor(() => {
		expect(
			screen.queryByRole("button", { name: /clear selection/i })
		).toBeNull();
	});
	expect(batches).toEqual([["p1", "p2"]]);
});

test("the selection bar's button keeps its spinner until its batch ends, though its rows stop qualifying as they land", async () => {
	let settle: (() => void) | undefined;
	const [data, setData] = createSignal(rows);
	const kick: BatchableAction<PersonRow> = {
		id: "kick",
		label: "Kick out",
		icon: "block",
		hotkey: "K",
		can: (row) => row.tier !== "former",
		run: () => {},
		runBatch: () =>
			new Promise((resolve) => {
				settle = () => {
					resolve({ refused: false });
				};
			}),
	};

	renderWithSelection((selection) => (
		<RosterTab.Root<PersonRow>
			tab={{ selection, active: true }}
			data={() => data()}
			columns={columns}
			groupBy="group"
			actions={() => [kick]}
			scope="members"
		>
			<Table.BatchActions>
				<BatchActionButton action={kick} />
			</Table.BatchActions>
		</RosterTab.Root>
	));

	const bar = await checkRows(1, 2);
	const button = within(bar).getByRole("button", { name: /kick out/i });
	fireEvent.click(button);
	expect(button).toHaveAttribute("aria-busy", "true");
	// Every write has landed: the refetched rows no longer qualify.
	setData(rows.map((row) => ({ ...row, tier: "former" })));
	await new Promise((resolve) => setTimeout(resolve, 0));
	function kickButton(): HTMLElement | null {
		return within(bar).queryByRole("button", { name: /kick out/i });
	}
	expect(kickButton()).toHaveAttribute("aria-busy", "true");
	settle?.();
	await waitFor(() => {
		expect(kickButton()).toBeNull();
	});
});
