// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

const { mockCreate, mockUpdate, mockRemove } = vi.hoisted(() => ({
	mockCreate: vi.fn(),
	mockUpdate: vi.fn().mockResolvedValue(undefined),
	mockRemove: vi.fn(),
}));

afterEach(() => {
	cleanup();
	mockCreate.mockClear();
	mockUpdate.mockClear();
	mockRemove.mockClear();
});

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutate: vi.fn().mockResolvedValue(undefined) }),
	useQuery: () => ({ data: () => undefined }),
}));

vi.mock("../data/inventoryData.ts", () => ({
	useItemActions: () => ({
		create: mockCreate,
		update: mockUpdate,
		remove: mockRemove,
	}),
}));

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

import type { Id } from "../../../../convex/_generated/dataModel";
import type { Item, ItemType } from "../data/inventoryData.ts";

import { ItemDrawer } from "./ItemDrawer.tsx";

const TYPE_CHAIR = "itemTypes:chair" as Id<"itemTypes">;
const CATEGORY = "itemCategories:furniture" as Id<"itemCategories">;

const chairType: ItemType = {
	_id: TYPE_CHAIR,
	_creationTime: 0,
	name: "Chair",
	categoryId: CATEGORY,
	categoryName: "Furniture",
};

const chair: Item = {
	_id: "items:chair" as Item["_id"],
	_creationTime: 0,
	assetTag: "A00001",
	typeId: TYPE_CHAIR,
	typeName: "Chair",
	categoryId: CATEGORY,
	categoryName: "Furniture",
	description: "Meeting room",
};

test("new item with initialAssetTag shows that tag in the field", () => {
	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			itemTypes={[]}
			initialAssetTag="A00001"
		/>
	));
	expect(screen.getByLabelText("Asset tag")).toHaveValue("A00001");
	expect(screen.getByText("New item")).toBeInTheDocument();
});

test("copy from item is offered on a new item, not when editing", () => {
	render(() => (
		<ItemDrawer open onOpenChange={() => {}} itemTypes={[]} items={[]} />
	));
	const copy = screen.getByRole("button", { name: /Copy from item/ });
	expect(copy).toBeDisabled();
	cleanup();

	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			item={chair}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));
	expect(
		screen.queryByRole("button", { name: /Copy from item/ })
	).not.toBeInTheDocument();
});

test("picking a source copies type and description and leaves the asset tag", async () => {
	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			itemTypes={[chairType]}
			items={[chair]}
			initialAssetTag="Z00099"
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: /Copy from item/ }));
	fireEvent.click(
		await screen.findByRole("button", { name: "A00001 Chair" })
	);
	expect(screen.getByDisplayValue("Z00099")).toBeInTheDocument();
	expect(screen.getByLabelText("Description")).toHaveValue("Meeting room");
	expect(screen.getByRole("combobox")).toHaveTextContent("Chair · Furniture");
	expect(
		screen.getByRole("button", { name: /Create item/ })
	).not.toBeDisabled();
});

test("blurring the description field autosaves that field only", () => {
	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			item={chair}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));
	const description = screen.getByLabelText("Description");
	fireEvent.input(description, {
		target: { value: "Storage room" },
	});
	expect(mockUpdate).not.toHaveBeenCalled();
	fireEvent.blur(description);
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith({
		id: chair._id,
		description: "Storage room",
	});
});

test("asset tag is read-only in edit mode and editing another field autosaves without closing", () => {
	const onOpenChange = vi.fn();
	render(() => (
		<ItemDrawer
			open
			onOpenChange={onOpenChange}
			item={chair}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));

	// In edit mode the asset tag is read-only text, not an editable input: the
	// tag is the slug, and autosaving it on blur would change the slug out from
	// under `selected()` and slam the drawer shut mid-edit.
	expect(screen.queryByLabelText("Asset tag")).not.toBeInTheDocument();
	expect(screen.getByText("A00001")).toBeInTheDocument();

	// Editing another field still autosaves that field only...
	const description = screen.getByLabelText("Description");
	fireEvent.input(description, { target: { value: "Storage room" } });
	fireEvent.blur(description);
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith({
		id: chair._id,
		description: "Storage room",
	});
	// ...and the drawer is never asked to close.
	expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

test("copying details does not invent an asset tag", async () => {
	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: /Copy from item/ }));
	fireEvent.click(
		await screen.findByRole("button", { name: "A00001 Chair" })
	);
	for (const field of screen.getAllByLabelText("Asset tag")) {
		expect(field).toHaveValue("");
	}
	expect(screen.getByRole("button", { name: /Create item/ })).toBeDisabled();
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows the skeleton (shaped like the loaded fields), not the create form or the 'New item' title", () => {
	render(() => (
		<ItemDrawer open onOpenChange={() => {}} itemTypes={[]} loading />
	));
	expect(screen.queryByText("New item")).toBeNull();
	expect(screen.queryByLabelText("Asset tag")).toBeNull();
	expect(screen.queryByRole("button", { name: /Create item/ })).toBeNull();
	expect(
		document.querySelector("[data-drawer-skeleton]")
	).toBeInTheDocument();
	expect(screen.getByText("Type")).toBeInTheDocument();
});

test("loading with an item also set (stale-during-refetch) still shows the skeleton, not the asset tag", () => {
	render(() => (
		<ItemDrawer
			open
			onOpenChange={() => {}}
			item={chair}
			itemTypes={[chairType]}
			loading
		/>
	));
	expect(screen.queryByText("A00001")).toBeNull();
	expect(screen.queryByText("Item")).toBeNull();
});

test("no item, not loading: shows the create form and 'New item' title", () => {
	render(() => (
		<ItemDrawer open onOpenChange={() => {}} itemTypes={[chairType]} />
	));
	expect(screen.getByText("New item")).toBeInTheDocument();
	expect(screen.getByLabelText("Asset tag")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create item/ })
	).toBeInTheDocument();
});
