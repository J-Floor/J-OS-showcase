// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { mockCreate, mockUpdate, mockRemove, mockUseItemsByType } = vi.hoisted(
	() => ({
		mockCreate: vi.fn(),
		mockUpdate: vi.fn().mockResolvedValue(undefined),
		mockRemove: vi.fn(),
		// Records the resolved typeId each call so tests can assert the drawer
		// asks for `undefined` (no subscription) in create mode and the real
		// id in edit mode.
		mockUseItemsByType: vi.fn(),
	})
);

const chairItems = [
	{ _id: "items:1", assetTag: "A00001" },
	{ _id: "items:2", assetTag: "A00002" },
];

afterEach(() => {
	cleanup();
	mockCreate.mockClear();
	mockUpdate.mockClear();
	mockRemove.mockClear();
	mockUseItemsByType.mockClear();
});

vi.mock("../data/inventoryData.ts", () => ({
	useItemTypeActions: () => ({
		create: mockCreate,
		update: mockUpdate,
		remove: mockRemove,
	}),
	useItemsByType: (typeId: () => string | undefined) => {
		const id = typeId();
		mockUseItemsByType(id);
		return {
			data: () => (id === "itemTypes:chair" ? chairItems : undefined),
		};
	},
}));

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import type { Id } from "../../../../convex/_generated/dataModel";
import type { Category, ItemType } from "../data/inventoryData.ts";

import { ItemTypeDrawer } from "./ItemTypeDrawer.tsx";

const CATEGORY_ID = "itemCategories:furniture" as Id<"itemCategories">;

const furniture: Category = {
	_id: CATEGORY_ID,
	_creationTime: 0,
	name: "Furniture",
};

const chairType: ItemType = {
	_id: "itemTypes:chair" as ItemType["_id"],
	_creationTime: 0,
	name: "Chair",
	categoryId: CATEGORY_ID,
	categoryName: "Furniture",
	description: "Stackable",
};

test("new item type: Create is disabled until a name and category are set", () => {
	render(() => (
		<ItemTypeDrawer open onOpenChange={() => {}} categories={[furniture]} />
	));
	expect(screen.getByText("New item type")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create item type/ })
	).toBeDisabled();
});

test("editing an existing item type shows its fields and no create button", () => {
	render(() => (
		<ItemTypeDrawer
			open
			onOpenChange={() => {}}
			itemType={chairType}
			categories={[furniture]}
		/>
	));
	expect(screen.getByText("Item type")).toBeInTheDocument();
	expect(screen.getByLabelText("Name")).toHaveValue("Chair");
	expect(screen.getByRole("combobox")).toHaveTextContent("Furniture");
	expect(
		screen.queryByRole("button", { name: /Create item type/ })
	).not.toBeInTheDocument();
});

test("blurring the name field autosaves that field only", () => {
	render(() => (
		<ItemTypeDrawer
			open
			onOpenChange={() => {}}
			itemType={chairType}
			categories={[furniture]}
		/>
	));
	const name = screen.getByLabelText("Name");
	fireEvent.input(name, { target: { value: "Armchair" } });
	expect(mockUpdate).not.toHaveBeenCalled();
	fireEvent.blur(name);
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith({
		id: chairType._id,
		name: "Armchair",
	});
});

test("edit mode: the items accordion lists the type's items by asset tag", () => {
	render(() => (
		<ItemTypeDrawer
			open
			onOpenChange={() => {}}
			itemType={chairType}
			categories={[furniture]}
		/>
	));
	expect(mockUseItemsByType).toHaveBeenCalledWith(chairType._id);
	expect(screen.getByText("Items (2)")).toBeInTheDocument();
	expect(screen.getByText("A00001")).toBeInTheDocument();
	expect(screen.getByText("A00002")).toBeInTheDocument();
});

test("create mode: no items sublist is rendered and no type id is requested", () => {
	render(() => (
		<ItemTypeDrawer open onOpenChange={() => {}} categories={[furniture]} />
	));
	expect(mockUseItemsByType).toHaveBeenCalledWith(undefined);
	expect(screen.queryByText(/^Items \(/)).not.toBeInTheDocument();
	expect(screen.queryByText("A00001")).not.toBeInTheDocument();
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows a skeleton, not the create form or the 'New item type' title", () => {
	render(() => (
		<ItemTypeDrawer
			open
			onOpenChange={() => {}}
			categories={[furniture]}
			loading
		/>
	));
	expect(screen.queryByText("New item type")).toBeNull();
	expect(screen.queryByLabelText("Name")).toBeNull();
	expect(
		screen.queryByRole("button", { name: /Create item type/ })
	).toBeNull();
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	expect(screen.getByText("Category")).toBeInTheDocument();
});

test("loading with an item type also set (stale-during-refetch) still shows the skeleton, not the name", () => {
	render(() => (
		<ItemTypeDrawer
			open
			onOpenChange={() => {}}
			itemType={chairType}
			categories={[furniture]}
			loading
		/>
	));
	expect(screen.queryByDisplayValue("Chair")).toBeNull();
	expect(screen.queryByText("Item type")).toBeNull();
});

test("no item type, not loading: shows the create form and 'New item type' title", () => {
	render(() => (
		<ItemTypeDrawer open onOpenChange={() => {}} categories={[furniture]} />
	));
	expect(screen.getByText("New item type")).toBeInTheDocument();
	expect(screen.getByLabelText("Name")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create item type/ })
	).toBeInTheDocument();
});
