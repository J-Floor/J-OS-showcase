// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import { createEntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import type { Item } from "../data/inventoryData.ts";

afterEach(cleanup);

if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

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
	useItemTypes: () => ({ data: () => [] }),
	useItemActions: () => ({
		create: vi.fn(),
		update: vi.fn(),
		remove: mockRemove,
	}),
}));

vi.mock("../columns/itemColumns.tsx", () => ({
	itemColumns: () => [
		{ accessorKey: "assetTag", header: "Asset tag", dataType: "string" },
	],
}));

vi.mock("../drawers/ItemDrawer.tsx", () => ({
	ItemDrawer: () => null,
}));

vi.mock("../print/inventoryListPdf.ts", () => ({
	generateInventoryListPdf: mockGenerate,
	inventoryListPdfFilename: mockFilename,
}));

vi.mock("../print/downloadPdf.ts", () => ({
	downloadPdf: mockDownload,
}));

vi.mock("../print/inventoryPdfAssets.ts", () => ({
	loadInventoryPdfAssets: () => Promise.resolve({}),
}));

import { ItemsTab } from "./ItemsTab.tsx";

function renderTab(): void {
	function Harness() {
		const selection = createEntitySelection<Item>({
			rows: () => rows,
			param: "item",
		});
		return <ItemsTab selection={selection} />;
	}
	render(() => (
		<MemoryRouter>
			<Route path="*" component={Harness} />
		</MemoryRouter>
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
	expect(generateArgs[0].map((r) => r.assetTag)).toEqual([
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
