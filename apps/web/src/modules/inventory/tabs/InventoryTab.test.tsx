// @vitest-environment happy-dom
import type { JfColumnDef } from "@j-os/design-system";
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
import { afterEach, expect, test } from "vitest";

import {
	createEntitySelection,
	type EntitySelection,
} from "../../../shared/entity/createEntitySelection.ts";

import { InventoryTab } from "./InventoryTab.tsx";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

type Row = { _id: string; name: string };

const COLUMNS: JfColumnDef<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
];

type Bag = {
	sel?: EntitySelection<Row>;
	search?: () => string;
};

// Renders InventoryTab driven by a REAL createEntitySelection (not a signal
// mock), so the URL-keyed open/close path — the surface where the C1 self-reopen
// bug lived — is exercised end to end. `bag.search` mirrors the router's
// reactive location because a `setSearchParams` write goes through
// `startTransition` and lags `MemoryHistory.get()`.
function renderHarness(opts?: {
	rows?: () => Row[] | undefined;
	history?: ReturnType<typeof createMemoryHistory>;
	newItemAssetTag?: () => string | undefined;
	enableRowSelection?: boolean;
	batchActions?: (props: {
		selectedCount: number;
		selectedRows: Row[];
	}) => JSX.Element;
	renderDrawer?: (args: {
		open: () => boolean;
		onOpenChange: (open: boolean) => void;
		row: () => Row | undefined;
		initialAssetTag: () => string | undefined;
		nav: {
			hasPrev: () => boolean;
			hasNext: () => boolean;
			onPrev: () => void;
			onNext: () => void;
		};
	}) => JSX.Element;
}): Bag {
	const bag: Bag = {};
	const rows = opts?.rows ?? (() => [] as Row[]);
	function Harness() {
		const sel = createEntitySelection<Row>({ rows, param: "item" });
		bag.sel = sel;
		const location = useLocation();
		bag.search = () => location.search;
		return (
			<InventoryTab
				data={rows}
				columns={() => COLUMNS}
				selection={sel}
				newItemAssetTag={opts?.newItemAssetTag}
				enableRowSelection={opts?.enableRowSelection}
				batchActions={opts?.batchActions}
				renderDrawer={
					opts?.renderDrawer ??
					((d) => (
						<div>
							{d.open()
								? sel.selectedId() !== undefined &&
									d.row() === undefined
									? `drawer:loading:${sel.selectedId()}`
									: `drawer:${d.row()?._id ?? "new"}:${d.initialAssetTag() ?? ""}`
								: "closed"}
						</div>
					))
				}
			/>
		);
	}
	render(() => (
		<MemoryRouter history={opts?.history}>
			<Route path="*" component={Harness} />
		</MemoryRouter>
	));
	return bag;
}

test("openCreate with a prefill tag opens the new-item drawer prefilled", async () => {
	const [tag, setTag] = createSignal<string>();
	const bag = renderHarness({ newItemAssetTag: tag });
	expect(screen.getByText("closed")).toBeInTheDocument();

	setTag("A00001");
	bag.sel?.openCreate();

	expect(await screen.findByText("drawer:new:A00001")).toBeInTheDocument();
});

test("openRow opens the row's drawer with no prefill tag", async () => {
	const [tag] = createSignal<string>("A00001");
	const bag = renderHarness({
		rows: () => [{ _id: "i1", name: "Chair" }],
		newItemAssetTag: tag,
	});

	bag.sel?.openRow({ _id: "i1", name: "Chair" });

	// Editing an existing row must ignore the create-mode prefill tag.
	expect(await screen.findByText("drawer:i1:")).toBeInTheDocument();
});

test("a deep-link ?item= opens the drawer instantly, showing loading (not the create form) until the row arrives", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/inventory?item=i1", replace: true });
	const bag = renderHarness({ rows, history });

	// Instant-open: the drawer opens for the row before `rows` resolves —
	// never "closed", and never the create form (which would show
	// "drawer:new:").
	expect(await screen.findByText("drawer:loading:i1")).toBeInTheDocument();
	expect(bag.sel?.open()).toBe(true);
	expect(bag.sel?.selected()).toBeUndefined();

	setRows([{ _id: "i1", name: "Chair" }]);
	expect(await screen.findByText("drawer:i1:")).toBeInTheDocument();
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
		await screen.findByText("drawer:loading:missing")
	).toBeInTheDocument();

	// Once the list loads WITHOUT the id, it's a dead link — the drawer must
	// close rather than fall back to showing the create form.
	setRows([{ _id: "i1", name: "Chair" }]);
	await waitFor(() => {
		expect(screen.getByText("closed")).toBeInTheDocument();
	});
	expect(bag.sel?.open()).toBe(false);
});

test("keeps the same drawer dialog node across a data() refetch while open", async () => {
	const [rows, setRows] = createSignal<Row[]>([{ _id: "i1", name: "Chair" }]);
	renderHarness({
		rows,
		renderDrawer: (d) => (
			<Show when={d.open()}>
				<div role="dialog">{d.row()?.name ?? "new"}</div>
			</Show>
		),
	}).sel?.openRow({ _id: "i1", name: "Chair" });

	const dialogBefore = await screen.findByRole("dialog");
	setRows([{ _id: "i1", name: "Chair v2" }]);
	const dialogAfter = screen.getByRole("dialog");
	expect(dialogAfter).toBe(dialogBefore);
	expect(dialogAfter).toHaveTextContent("Chair v2");
});

// C1 regression: the old bridge (`itemOpenCommand()` derived from `selected()`,
// fed to a `requestOpenItem` effect) re-fired on every rows() refetch because
// closing never cleared the selection — so the drawer reopened by itself after
// you closed it and any item was edited. The drawer is now driven straight off
// the selection, and close() clears both selectedId and the URL param.
test("closing the drawer keeps it closed across a later refetch (no self-reopen)", async () => {
	const [rows, setRows] = createSignal<Row[]>([{ _id: "i1", name: "Chair" }]);
	// A base page to be on: opening a drawer pushes a history entry and closing
	// pops it (as in the real app, where the tab is always reached from a page).
	const history = createMemoryHistory();
	history.set({ value: "/inventory", replace: true });
	const bag = renderHarness({
		rows,
		history,
		renderDrawer: (d) => (
			<div>
				<Show when={d.open()}>
					<span role="dialog">open</span>
				</Show>
				<button
					onClick={() => {
						d.onOpenChange(false);
					}}
				>
					close-drawer
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

	// Close exactly the way the real drawer does — via onOpenChange(false).
	fireEvent.click(screen.getByRole("button", { name: "close-drawer" }));
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	// The URL param must clear before the refetch: if ?item=i1 lingered, the
	// inbound effect would re-run on the new rows and reopen the row.
	await waitFor(() => {
		expect(bag.search?.()).not.toContain("item=");
	});

	// A refetch (someone edits an item) must NOT resurrect the drawer.
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
		batchActions: (p) => <span>{`sel:${String(p.selectedCount)}`}</span>,
	});
	const checks = await screen.findAllByRole("checkbox");
	// Header select-all plus one per row.
	expect(checks).toHaveLength(4);
});

test("header select-all checks every visible row and shows the batch bar", async () => {
	renderHarness({
		rows: () => THREE_ROWS,
		enableRowSelection: true,
		batchActions: (p) => <span>{`sel:${String(p.selectedCount)}`}</span>,
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

test("clicking a row checkbox does not open the drawer", async () => {
	renderHarness({
		rows: () => THREE_ROWS,
		enableRowSelection: true,
		batchActions: (p) => <span>{`sel:${String(p.selectedCount)}`}</span>,
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
	expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
});
