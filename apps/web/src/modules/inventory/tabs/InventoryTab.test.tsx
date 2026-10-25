// @vitest-environment happy-dom
import { Table, type JfColumnDefinition } from "@j-os/design-system";
import {
	MemoryRouter,
	Route,
	createMemoryHistory,
	useLocation,
} from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal, Show, type JSX } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "../../../../convex/_generated/api";
import { AbilityProvider } from "../../../lib/ability.tsx";
import {
	createEntitySelection,
	type EntitySelection,
} from "../../../shared/entity/createEntitySelection.ts";
import type { EntityDescriptor } from "../../../shared/entity/entityDescriptor.ts";
import { itemTypeEntity } from "../entity.ts";

import { InventoryTab, type InventorySheetArgs } from "./InventoryTab.tsx";

const prefetch = vi.fn<(...args: unknown[]) => void>();
vi.mock("../../../shared/data/queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("../../../shared/data/queryKeeper.ts")>()),
	prefetchSpec: (
		spec: { query: unknown; args: (key: unknown) => unknown },
		key: unknown
	) => {
		prefetch(spec.query, spec.args(key));
	},
}));

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

type Row = { _id: string; name: string };

const COLUMNS: JfColumnDefinition<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
];

type Bag = {
	sel?: EntitySelection<Row>;
	search?: () => string;
};

function SelectionCount() {
	const batch = Table.useSelection<Row>();
	return <span>{`sel:${String(batch.count())}`}</span>;
}

function sheetText(
	sheet: InventorySheetArgs<Row>,
	requestedId: string | undefined
): string {
	if (!sheet.open()) return "closed";
	return requestedId !== undefined && sheet.row() === undefined
		? `sheet:loading:${requestedId}`
		: `sheet:${sheet.row()?._id ?? "new"}:${sheet.initialAssetTag() ?? ""}`;
}

// Renders InventoryTab driven by a REAL createEntitySelection (not a signal
// mock), so the URL-keyed open/close path — the surface where the C1 self-reopen
// bug lived — is exercised end to end. `bag.search` mirrors the router's
// reactive location because a `setSearchParams` write goes through
// `startTransition` and lags `MemoryHistory.get()`.
function renderHarness(options?: {
	rows?: () => Row[] | undefined;
	history?: ReturnType<typeof createMemoryHistory>;
	newItemAssetTag?: () => string | undefined;
	enableRowSelection?: boolean;
	descriptor?: EntityDescriptor<Row>;
	batchActions?: () => JSX.Element;
	renderSheet?: (args: InventorySheetArgs<Row>) => JSX.Element;
}): Bag {
	const bag: Bag = {};
	const rows = options?.rows ?? (() => [] as Row[]);
	function Harness() {
		const sel = createEntitySelection<Row>({ rows, param: "item" });
		bag.sel = sel;
		const location = useLocation();
		bag.search = () => location.search;
		return (
			<InventoryTab.Root
				data={rows}
				columns={() => COLUMNS}
				selection={sel}
				descriptor={options?.descriptor}
				newItemAssetTag={options?.newItemAssetTag}
				enableRowSelection={options?.enableRowSelection}
			>
				<InventoryTab.Sheet<Row>>
					{(sheet: InventorySheetArgs<Row>) =>
						options?.renderSheet?.(sheet) ?? (
							<div>{sheetText(sheet, sel.requestedId())}</div>
						)
					}
				</InventoryTab.Sheet>
				<Show when={options?.batchActions}>
					<Table.BatchActions>
						{options?.batchActions?.()}
					</Table.BatchActions>
				</Show>
			</InventoryTab.Root>
		);
	}
	render(() => (
		<AbilityProvider role="board">
			<MemoryRouter history={options?.history}>
				<Route path="*" component={Harness} />
			</MemoryRouter>
		</AbilityProvider>
	));
	return bag;
}

test("openCreate with a prefill tag opens the new-item sheet prefilled", async () => {
	const [tag, setTag] = createSignal<string>();
	const bag = renderHarness({ newItemAssetTag: tag });
	expect(screen.getByText("closed")).toBeInTheDocument();

	setTag("A00001");
	bag.sel?.openCreate();

	expect(await screen.findByText("sheet:new:A00001")).toBeInTheDocument();
});

test("openRow opens the row's sheet with no prefill tag", async () => {
	const [tag] = createSignal<string>("A00001");
	const bag = renderHarness({
		rows: () => [{ _id: "i1", name: "Chair" }],
		newItemAssetTag: tag,
	});

	bag.sel?.openRow({ _id: "i1", name: "Chair" });

	// Editing an existing row must ignore the create-mode prefill tag.
	expect(await screen.findByText("sheet:i1:")).toBeInTheDocument();
});

test("a deep-link ?item= opens the sheet instantly, showing loading (not the create form) until the row arrives", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/inventory?item=i1", replace: true });
	const bag = renderHarness({ rows, history });

	// Instant-open: the sheet opens for the row before `rows` resolves —
	// never "closed", and never the create form (which would show
	// "sheet:new:").
	expect(await screen.findByText("sheet:loading:i1")).toBeInTheDocument();
	expect(bag.sel?.open()).toBe(true);
	expect(bag.sel?.selected()).toBeUndefined();

	setRows([{ _id: "i1", name: "Chair" }]);
	expect(await screen.findByText("sheet:i1:")).toBeInTheDocument();
	expect(bag.sel?.open()).toBe(true);
	expect(bag.sel?.selected()).toEqual({ _id: "i1", name: "Chair" });
});

test("a deep-link for a nonexistent id closes once the row's absence is confirmed by a loaded list", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/inventory?item=missing", replace: true });
	const bag = renderHarness({ rows, history });

	// Still opens optimistically while the list is loading.
	expect(
		await screen.findByText("sheet:loading:missing")
	).toBeInTheDocument();

	// Once the list loads WITHOUT the id, it's a dead link — the sheet must
	// close rather than fall back to showing the create form.
	setRows([{ _id: "i1", name: "Chair" }]);
	await waitFor(() => {
		expect(screen.getByText("closed")).toBeInTheDocument();
	});
	expect(bag.sel?.open()).toBe(false);
});

test("keeps the same sheet dialog node across a data() refetch while open", async () => {
	const [rows, setRows] = createSignal<Row[]>([{ _id: "i1", name: "Chair" }]);
	renderHarness({
		rows,
		renderSheet: (sheet) => (
			<Show when={sheet.open()}>
				<div role="dialog">{sheet.row()?.name ?? "new"}</div>
			</Show>
		),
	}).sel?.openRow({ _id: "i1", name: "Chair" });

	const dialogBefore = await screen.findByRole("dialog");
	setRows([{ _id: "i1", name: "Chair v2" }]);
	const dialogAfter = screen.getByRole("dialog");
	expect(dialogAfter).toBe(dialogBefore);
	expect(dialogAfter).toHaveTextContent("Chair v2");
});

test("paging with the sheet's nav shows the next row without re-creating the sheet", async () => {
	const created = vi.fn();
	function PagedSheet(props: { sheet: InventorySheetArgs<Row> }) {
		created();
		return (
			<div>
				<span role="dialog">{props.sheet.row()?.name ?? "none"}</span>
				<button
					onClick={() => {
						props.sheet.nav.onNext();
					}}
				>
					next-row
				</button>
			</div>
		);
	}
	renderHarness({
		rows: () => THREE_ROWS,
		renderSheet: (sheet) => <PagedSheet sheet={sheet} />,
	}).sel?.openRow(THREE_ROWS[0]);

	expect(await screen.findByRole("dialog")).toHaveTextContent("Chair");
	fireEvent.click(screen.getByRole("button", { name: "next-row" }));
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveTextContent("Lamp");
	});
	fireEvent.click(screen.getByRole("button", { name: "next-row" }));
	await waitFor(() => {
		expect(screen.getByRole("dialog")).toHaveTextContent("Desk");
	});
	expect(created).toHaveBeenCalledTimes(1);
});

// C1 regression: the old bridge (`itemOpenCommand()` derived from `selected()`,
// fed to a `requestOpenItem` effect) re-fired on every rows() refetch because
// closing never cleared the selection — so the sheet reopened by itself after
// you closed it and any item was edited. The sheet is now driven straight off
// the selection, and close() clears both requestedId and the URL param.
test("closing the sheet keeps it closed across a later refetch (no self-reopen)", async () => {
	const [rows, setRows] = createSignal<Row[]>([{ _id: "i1", name: "Chair" }]);
	// A base page to be on: opening a sheet pushes a history entry and closing
	// pops it (as in the real app, where the tab is always reached from a page).
	const history = createMemoryHistory();
	history.set({ value: "/inventory", replace: true });
	const bag = renderHarness({
		rows,
		history,
		renderSheet: (sheet) => (
			<div>
				<Show when={sheet.open()}>
					<span role="dialog">open</span>
				</Show>
				<button
					onClick={() => {
						sheet.onOpenChange(false);
					}}
				>
					close-sheet
				</button>
			</div>
		),
	});

	bag.sel?.openRow({ _id: "i1", name: "Chair" });
	await screen.findByRole("dialog");
	// Let the open's URL push settle before closing — close() pops that entry.
	await waitFor(() => {
		expect(bag.search?.()).toContain("item=i1");
	});

	// Close exactly the way the real sheet does — via onOpenChange(false).
	fireEvent.click(screen.getByRole("button", { name: "close-sheet" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	// The URL param must clear before the refetch: if ?item=i1 lingered, the
	// inbound effect would re-run on the new rows and reopen the row.
	await waitFor(() => {
		expect(bag.search?.()).not.toContain("item=");
	});

	// A refetch (someone edits an item) must NOT resurrect the sheet.
	setRows([{ _id: "i1", name: "Chair v2" }]);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	expect(bag.sel?.open()).toBe(false);
});

const THREE_ROWS = [
	{ _id: "i1", name: "Chair" },
	{ _id: "i2", name: "Lamp" },
	{ _id: "i3", name: "Desk" },
];

test("row selection adds a checkbox column and header select-all", async () => {
	renderHarness({
		rows: () => THREE_ROWS,
		enableRowSelection: true,
		batchActions: () => <SelectionCount />,
	});
	const checks = await screen.findAllByRole("checkbox");
	// Header select-all plus one per row.
	expect(checks).toHaveLength(4);
});

test("header select-all checks every visible row and shows the batch bar", async () => {
	renderHarness({
		rows: () => THREE_ROWS,
		enableRowSelection: true,
		batchActions: () => <SelectionCount />,
	});
	const checks = await screen.findAllByRole("checkbox");
	fireEvent.click(checks[0]);
	await waitFor(() => {
		expect(screen.getByText("sel:3")).toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: /clear selection/i })
	).toBeInTheDocument();
	for (const box of checks) {
		expect(box).toBeChecked();
	}
});

test("clicking a row checkbox does not open the sheet", async () => {
	renderHarness({
		rows: () => THREE_ROWS,
		enableRowSelection: true,
		batchActions: () => <SelectionCount />,
	});
	expect(screen.getByText("closed")).toBeInTheDocument();
	const checks = await screen.findAllByRole("checkbox");
	fireEvent.click(checks[1]);
	await waitFor(() => {
		expect(screen.getByText("sel:1")).toBeInTheDocument();
	});
	expect(screen.getByText("closed")).toBeInTheDocument();
});

test("shows a table skeleton while data is undefined, real rows once loaded", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	renderHarness({ rows });
	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);

	setRows([{ _id: "i1", name: "Chair" }]);
	await waitFor(() => expect(screen.getByText("Chair")).toBeInTheDocument());
	expect(document.querySelectorAll("[data-skeleton-row]")).toHaveLength(0);
});

test("hovering an item-type row prefetches its items with the sheet's args", () => {
	prefetch.mockClear();
	renderHarness({
		rows: () => [{ _id: "t1", name: "Drill" }],
		descriptor: itemTypeEntity as unknown as EntityDescriptor<Row>,
	});
	vi.useFakeTimers();
	fireEvent.pointerEnter(screen.getAllByRole("row")[1]);
	vi.advanceTimersByTime(150);
	vi.useRealTimers();
	expect(prefetch).toHaveBeenCalledWith(api.inventory.listItemsByType, {
		typeId: "t1",
	});
});
