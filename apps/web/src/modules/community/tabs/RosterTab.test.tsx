// @vitest-environment happy-dom
import { Button, Table, type JfColumnDefinition } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { okAsync } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";

import type { PersonRow } from "../../../../convex/people.ts";

import { RosterTab, useRosterBatch } from "./RosterTab.tsx";
import { openPanel, renderWithSelection } from "./testSelection.tsx";

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

test("a tab's Table.BatchActions children read the shared batch runner from useRosterBatch()", async () => {
	const action = vi.fn(() => okAsync(undefined));

	function RunAll() {
		const runBatch = useRosterBatch();
		const selection = Table.useSelection<PersonRow>();
		return (
			<Button
				onClick={() => {
					void runBatch(selection.rows(), action, selection.clear);
				}}
			>
				Run on selection
			</Button>
		);
	}

	renderWithSelection((selection) => (
		<RosterTab.Root<PersonRow>
			tab={{ selection, active: true }}
			data={() => rows}
			columns={columns}
			groupBy="group"
			actions={() => []}
			scope="members"
		>
			<Table.BatchActions>
				<RunAll />
			</Table.BatchActions>
		</RosterTab.Root>
	));

	// 0 is the select-all header checkbox; 1 and 2 are the rows.
	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);
	fireEvent.click(checkboxes[2]);
	fireEvent.click(
		await screen.findByRole("button", { name: /run on selection/i })
	);

	await waitFor(() => {
		expect(action).toHaveBeenCalledTimes(2);
	});
	expect(action).toHaveBeenCalledWith("p1");
	expect(action).toHaveBeenCalledWith("p2");
	// The runner clears the selection once every row went through.
	await waitFor(() => {
		expect(
			screen.queryByRole("button", { name: /run on selection/i })
		).toBeNull();
	});
});
