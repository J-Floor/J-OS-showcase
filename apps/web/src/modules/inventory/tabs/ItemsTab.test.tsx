// @vitest-environment happy-dom
import {
	Sheet,
	ShortcutPeekProvider,
	useOverlayCovered,
} from "@j-os/design-system";
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { ok } from "neverthrow";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import { AbilityProvider } from "../../../lib/ability.tsx";
import { ConfirmProvider } from "../../../shared/confirm.tsx";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";
import type { Item } from "../data/inventoryData.ts";
import { createInventoryPageActions } from "../inventoryActions.ts";

afterEach(() => {
	cleanup();
	setIsActive(true);
	counts.length = 0;
});

const { mockRemove, mockGenerate, mockDownload, mockFilename } = vi.hoisted(
	() => ({
		mockRemove: vi.fn(() => Promise.resolve()),
		mockGenerate: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
		mockDownload: vi.fn(),
		mockFilename: vi.fn(() => "inventory-list-2026-09-12.pdf"),
	})
);

const TYPE = "itemTypes:chair" as Id<"itemTypes">;
const CATEGORY = "itemCategories:furniture" as Id<"itemCategories">;

function item(id: string, assetTag: string, extra?: Partial<Item>): Item {
	return {
		_id: id as Item["_id"],
		_creationTime: 0,
		assetTag,
		typeId: TYPE,
		typeName: "Chair",
		categoryId: CATEGORY,
		categoryName: "Furniture",
		description: extra?.description,
		...extra,
	};
}

const rows = [
	item("items:1", "A00001", { description: "Meeting room" }),
	item("items:2", "A00002", { typeName: "Lamp", categoryName: "Lighting" }),
	item("items:3", "A00003", { description: "Hallway" }),
];

vi.mock("../data/inventoryData.ts", () => ({
	useItems: () => ({ data: () => rows }),
	useItemActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: mockRemove,
	}),
}));

const { mockColumns } = vi.hoisted(() => ({
	mockColumns: vi.fn(() => [
		{ accessorKey: "assetTag", header: "Asset tag", dataType: "string" },
	]),
}));

vi.mock("../columns/itemColumns.tsx", () => ({
	createItemColumns: () => mockColumns,
}));

vi.mock("../sheets/ItemSheet.tsx", () => ({
	ItemSheet: () => null,
}));

vi.mock("../print/inventoryListPdf.ts", () => ({
	generateInventoryListPdf: mockGenerate,
	inventoryListPdfFilename: mockFilename,
}));

vi.mock("../print/downloadPdf.ts", () => ({
	downloadPdf: mockDownload,
}));

vi.mock("../print/inventoryPdfAssets.ts", () => ({
	loadInventoryPdfAssets: () => Promise.resolve(ok({})),
}));

import { ItemsTab } from "./ItemsTab.tsx";

const [isActive, setIsActive] = createSignal(true);
const counts: number[] = [];
let openRow: (() => void) | undefined;

function Harness() {
	const selection = createEntitySelection<Item>({
		rows: () => rows,
		param: "item",
	});
	openRow = () => {
		selection.openRow(rows[0]);
	};
	return (
		<ItemsTab
			selection={selection}
			active={isActive()}
			onSelectedCountChange={(count) => counts.push(count)}
		/>
	);
}

function renderTab(): void {
	render(() => (
		<AbilityProvider role="board">
			<MemoryRouter>
				<Route path="*" component={Harness} />
			</MemoryRouter>
		</AbilityProvider>
	));
}

async function batchBar(): Promise<HTMLElement> {
	const clear = await screen.findByRole("button", {
		name: /clear selection/i,
	});
	return clear.parentElement!;
}

test("Print generates a PDF of the checked rows and downloads it", async () => {
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[3]);

	const print = within(await batchBar()).getByRole("button", {
		name: /print/i,
	});
	fireEvent.click(print);

	await waitFor(() => {
		expect(mockGenerate).toHaveBeenCalledTimes(1);
	});
	const generateArgs = mockGenerate.mock.calls[0] as unknown as [
		Item[],
		{ now: Date },
	];
	expect(generateArgs[0].map((row) => row.assetTag)).toEqual([
		"A00001",
		"A00003",
	]);
	expect(generateArgs[1].now).toBeInstanceOf(Date);
	expect(mockDownload).toHaveBeenCalledTimes(1);
	const downloadArgs = mockDownload.mock.calls[0] as unknown as [
		Uint8Array,
		string,
	];
	expect(downloadArgs[0]).toBeInstanceOf(Uint8Array);
	expect(downloadArgs[1]).toBe("inventory-list-2026-09-12.pdf");
	// Print leaves the selection in place so you can print again or delete.
	expect(
		screen.getByRole("button", { name: /clear selection/i })
	).toBeInTheDocument();
});

test("Delete removes each selected item, not just the first", async () => {
	mockRemove.mockClear();
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);

	const del = within(await batchBar()).getByRole("button", {
		name: /delete/i,
	});
	fireEvent.click(del);

	await waitFor(() => {
		expect(mockRemove).toHaveBeenCalledTimes(2);
	});
	expect(mockRemove).toHaveBeenCalledWith("items:1");
	expect(mockRemove).toHaveBeenCalledWith("items:2");
	expect(mockRemove).not.toHaveBeenCalledWith("items:3");
});

test("a refused batch delete shows the reason in the batch bar and keeps the selection", async () => {
	mockRemove.mockClear();
	mockRemove.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);

	const bar = await batchBar();
	fireEvent.click(within(bar).getByRole("button", { name: /delete/i }));

	expect(
		await within(bar).findByText("You can't do that.")
	).toBeInTheDocument();
	expect(mockRemove).toHaveBeenCalledTimes(1);
	expect(
		screen.getByRole("button", { name: /clear selection/i })
	).toBeInTheDocument();
});

test("re-making the selection drops the old batch delete failure", async () => {
	mockRemove.mockClear();
	mockRemove.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	const bar = await batchBar();
	fireEvent.click(within(bar).getByRole("button", { name: /delete/i }));
	expect(
		await within(bar).findByText("You can't do that.")
	).toBeInTheDocument();
	fireEvent.click(checks[2]);
	await waitFor(() => {
		expect(screen.queryByText("You can't do that.")).toBeNull();
	});
});

test("a batch delete in flight shows its spinner, and a second click or Delete starts nothing", async () => {
	mockRemove.mockClear();
	let settle: (() => void) | undefined;
	mockRemove.mockImplementationOnce(
		() =>
			new Promise<undefined>((resolve) => {
				settle = () => {
					resolve(undefined);
				};
			})
	);
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);
	const del = within(await batchBar()).getByRole("button", {
		name: /delete/i,
	});
	fireEvent.click(del);
	await waitFor(() => {
		expect(mockRemove).toHaveBeenCalledTimes(1);
	});
	expect(del).toHaveAttribute("aria-busy", "true");
	fireEvent.click(del);
	fireEvent.keyDown(document, { key: "Delete" });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mockRemove).toHaveBeenCalledTimes(1);
	settle?.();
	await waitFor(() => {
		expect(mockRemove).toHaveBeenCalledTimes(2);
	});
});

// --- keys ---------------------------------------------------------------

test("P prints the checked rows once, and Delete asks once for all of them", async () => {
	mockRemove.mockClear();
	mockGenerate.mockClear();
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);
	await batchBar();

	fireEvent.keyDown(document, { key: "p" });
	await waitFor(() => {
		expect(mockGenerate).toHaveBeenCalledTimes(1);
	});
	const printed = mockGenerate.mock.calls[0] as unknown as [Item[]];
	expect(printed[0].map((row) => row.assetTag)).toEqual(["A00001", "A00002"]);

	fireEvent.keyDown(document, { key: "Delete" });
	await waitFor(() => {
		expect(mockRemove).toHaveBeenCalledTimes(2);
	});
});

test("the batch keys are ignored while typing, on another tab, over a sheet and with nothing checked", async () => {
	mockRemove.mockClear();
	mockGenerate.mockClear();
	renderTab();
	fireEvent.keyDown(document, { key: "Delete" });
	fireEvent.keyDown(document, { key: "p" });
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	await batchBar();

	const input = document.createElement("input");
	document.body.append(input);
	fireEvent.keyDown(input, { key: "Delete" });
	fireEvent.keyDown(input, { key: "p" });
	input.remove();

	setIsActive(false);
	fireEvent.keyDown(document, { key: "Delete" });
	fireEvent.keyDown(document, { key: "p" });
	setIsActive(true);

	openRow?.();
	await waitFor(() => {
		expect(counts.length).toBeGreaterThan(0);
	});
	fireEvent.keyDown(document, { key: "Delete" });
	fireEvent.keyDown(document, { key: "p" });

	await Promise.resolve();
	expect(mockRemove).not.toHaveBeenCalled();
	expect(mockGenerate).not.toHaveBeenCalled();
});

test("the tab reports how many rows are checked", async () => {
	renderTab();
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);
	await batchBar();
	expect(counts.at(-1)).toBe(2);
	fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
	await waitFor(() => {
		expect(counts.at(-1)).toBe(0);
	});
});

test("the batch buttons name their keys in a chip while peeking", async () => {
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<AbilityProvider role="board">
				<MemoryRouter>
					<Route path="*" component={Harness} />
				</MemoryRouter>
			</AbilityProvider>
		</ShortcutPeekProvider>
	));
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	const bar = within(await batchBar());
	const print = bar.getByRole("button", { name: /print/i });
	const del = bar.getByRole("button", { name: /delete/i });
	expect(print).toHaveAttribute("aria-keyshortcuts", "P");
	expect(del).toHaveAttribute("aria-keyshortcuts", "Delete");
	expect(print.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /show keyboard/i }));
	expect(print.querySelector("kbd")).not.toBeNull();
	expect(del.querySelector("kbd")).not.toBeNull();
});

test("with rows checked and the scanner open, no key fires; once it closes, P prints the checked rows once and the page's P stays out", async () => {
	mockRemove.mockClear();
	mockGenerate.mockClear();
	const [isScanning, setScanning] = createSignal(false);
	const [checkedCount, setCheckedCount] = createSignal(0);
	let isPageCovered: (() => boolean) | undefined;
	// The page as `InventoryPage` wires it: its keys step aside while rows
	// are checked or the scanner is open, and the tab is inactive under it.
	function Page() {
		const selection = createEntitySelection<Item>({
			rows: () => rows,
			param: "item",
		});
		createInventoryPageActions({
			activeTab: () => "items",
			isOverlayOpen: isScanning,
			itemRows: () => rows,
			selectedCount: checkedCount,
			openNewItem: () => {},
			openNewType: () => {},
			openNewCategory: () => {},
			openScanner: () => {},
		});
		isPageCovered = useOverlayCovered();
		return (
			<>
				<ItemsTab
					selection={selection}
					active={!isScanning()}
					onSelectedCountChange={setCheckedCount}
				/>
				{/* Stands in for the scanner: a dialog over the page. */}
				<Sheet.Root open={isScanning()} onOpenChange={() => {}}>
					<Sheet.Header>
						<Sheet.Title>Scan asset tag</Sheet.Title>
					</Sheet.Header>
				</Sheet.Root>
			</>
		);
	}
	render(() => (
		<AbilityProvider role="board">
			<ConfirmProvider>
				<MemoryRouter>
					<Route path="*" component={Page} />
				</MemoryRouter>
			</ConfirmProvider>
		</AbilityProvider>
	));
	const checks = screen.getAllByRole("checkbox");
	fireEvent.click(checks[1]);
	fireEvent.click(checks[2]);
	await batchBar();
	setScanning(true);
	for (const key of ["p", "Delete", "n"])
		fireEvent.keyDown(document, { key });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mockGenerate).not.toHaveBeenCalled();
	expect(screen.queryByText("Delete 2 item(s)?")).toBeNull();
	expect(mockRemove).not.toHaveBeenCalled();

	setScanning(false);
	await waitFor(() => {
		expect(isPageCovered?.()).toBe(false);
	});
	fireEvent.keyDown(document, { key: "p" });
	await waitFor(() => {
		expect(mockGenerate).toHaveBeenCalledTimes(1);
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mockGenerate).toHaveBeenCalledTimes(1);
	const printed = mockGenerate.mock.calls[0] as unknown as [Item[]];
	expect(printed[0].map((row) => row.assetTag)).toEqual(["A00001", "A00002"]);
});
