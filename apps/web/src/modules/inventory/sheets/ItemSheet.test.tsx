// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
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
	useQuery: () => ({ data: () => {} }),
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
import {
	keyedIn,
	sheetKeys,
	sheetSkeleton,
	tableRowKeys,
	titleAround,
	titleKeyOf,
} from "../../../../test-stubs/morphKeys.tsx";
import { itemColumns } from "../columns/itemColumns.tsx";
import type { Item, ItemType } from "../data/inventoryData.ts";

import { ItemSheet } from "./ItemSheet.tsx";

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
		<ItemSheet
			open
			onOpenChange={() => {}}
			itemTypes={[]}
			initialAssetTag="A00001"
		/>
	));
	expect(screen.getByLabelText("Asset tag letter")).toHaveValue("A");
	expect(screen.getByLabelText("Asset tag number")).toHaveValue("00001");
	expect(screen.getByText("New item")).toBeInTheDocument();
});

test("a scanned tag is where the new item starts: Escape closes without asking", async () => {
	const onOpenChange = vi.fn();
	render(() => (
		<ItemSheet
			open
			onOpenChange={onOpenChange}
			itemTypes={[]}
			initialAssetTag="A00001"
		/>
	));
	const sheet = screen.getByRole("dialog", { name: "New item" });
	await waitFor(() => {
		fireEvent.keyDown(sheet, { key: "Escape" });
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	expect(
		screen.queryByRole("dialog", { name: "Discard new item?" })
	).toBeNull();
});

test("a new item with a typed description asks before Escape throws it away", async () => {
	const onOpenChange = vi.fn();
	render(() => (
		<ItemSheet
			open
			onOpenChange={onOpenChange}
			itemTypes={[]}
			initialAssetTag="A00001"
		/>
	));
	fireEvent.input(screen.getByLabelText("Description"), {
		target: { value: "Meeting room" },
	});
	const sheet = screen.getByRole("dialog", { name: "New item" });
	// Ark hears Escape a moment after the open: press until it asks.
	await waitFor(() => {
		if (!screen.queryByRole("dialog", { name: "Discard new item?" }))
			fireEvent.keyDown(sheet, { key: "Escape" });
		expect(
			screen.getByRole("dialog", { name: "Discard new item?" })
		).toBeInTheDocument();
	});
	expect(onOpenChange).not.toHaveBeenCalled();
});

test("copy from item is offered on a new item, not when editing", () => {
	render(() => (
		<ItemSheet open onOpenChange={() => {}} itemTypes={[]} items={[]} />
	));
	const copy = screen.getByRole("button", { name: /Copy from item/ });
	expect(copy).toBeDisabled();
	cleanup();

	render(() => (
		<ItemSheet
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
		<ItemSheet
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
	expect(screen.getByLabelText("Asset tag letter")).toHaveValue("Z");
	expect(screen.getByLabelText("Asset tag number")).toHaveValue("00099");
	expect(screen.getByLabelText("Description")).toHaveValue("Meeting room");
	expect(screen.getByRole("combobox")).toHaveTextContent("Chair · Furniture");
	expect(
		screen.getByRole("button", { name: /Create item/ })
	).not.toBeDisabled();
});

test("blurring the description field autosaves that field only", () => {
	render(() => (
		<ItemSheet
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
		<ItemSheet
			open
			onOpenChange={onOpenChange}
			item={chair}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));

	// In edit mode the asset tag is read-only text, not an editable input: the
	// tag is the slug, and autosaving it on blur would change the slug out from
	// under `selected()` and slam the sheet shut mid-edit.
	expect(screen.queryByRole("group", { name: "Asset tag" })).toBeNull();
	// Shown twice: the sheet title, and the read-only tag row.
	expect(
		within(screen.getByRole("dialog")).getAllByText("A00001")
	).toHaveLength(2);

	// Editing another field still autosaves that field only...
	const description = screen.getByLabelText("Description");
	fireEvent.input(description, { target: { value: "Storage room" } });
	fireEvent.blur(description);
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith({
		id: chair._id,
		description: "Storage room",
	});
	// ...and the sheet is never asked to close.
	expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

test("copying details does not invent an asset tag", async () => {
	render(() => (
		<ItemSheet
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
	expect(screen.getByLabelText("Asset tag letter")).toHaveValue("");
	expect(screen.getByLabelText("Asset tag number")).toHaveValue("");
	expect(screen.getByRole("button", { name: /Create item/ })).toBeDisabled();
});

// --- tri-state: create / loading / loaded --------------------------------

test("loading: shows the skeleton (shaped like the loaded fields), not the create form or the 'New item' title", () => {
	render(() => (
		<ItemSheet open onOpenChange={() => {}} itemTypes={[]} loading />
	));
	expect(screen.queryByText("New item")).toBeNull();
	expect(screen.queryByRole("group", { name: "Asset tag" })).toBeNull();
	expect(screen.queryByRole("button", { name: /Create item/ })).toBeNull();
	expect(sheetSkeleton()).toBeInTheDocument();
	expect(screen.getByText("Type")).toBeInTheDocument();
});

test("loading with an item also set (stale-during-refetch) still shows the skeleton, not the asset tag", () => {
	render(() => (
		<ItemSheet
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
		<ItemSheet open onOpenChange={() => {}} itemTypes={[chairType]} />
	));
	expect(screen.getByText("New item")).toBeInTheDocument();
	expect(
		screen.getByRole("group", { name: "Asset tag" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Create item/ })
	).toBeInTheDocument();
});

test("an invalid asset tag keeps Create disabled even with a type chosen", async () => {
	render(() => (
		<ItemSheet
			open
			onOpenChange={() => {}}
			itemTypes={[chairType]}
			items={[chair]}
			initialAssetTag="not-a-tag"
		/>
	));
	fireEvent.click(screen.getByRole("button", { name: /Copy from item/ }));
	fireEvent.click(
		await screen.findByRole("button", { name: "A00001 Chair" })
	);
	expect(screen.getByRole("combobox")).toHaveTextContent("Chair · Furniture");
	expect(screen.getByRole("button", { name: /Create item/ })).toBeDisabled();
});

test("pasting a full tag with a type chosen enables Create", async () => {
	render(() => (
		<ItemSheet
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
	expect(screen.getByRole("button", { name: /Create item/ })).toBeDisabled();
	fireEvent.paste(screen.getByLabelText("Asset tag letter"), {
		clipboardData: { getData: () => "a00012" },
	});
	expect(
		screen.getByRole("button", { name: /Create item/ })
	).not.toBeDisabled();
});

test("an incomplete asset tag says what to enter once the group is left", () => {
	render(() => (
		<ItemSheet open onOpenChange={() => {}} itemTypes={[chairType]} />
	));
	const letter = screen.getByLabelText("Asset tag letter");
	const number = screen.getByLabelText("Asset tag number");
	fireEvent.input(letter, { target: { value: "a" } });
	fireEvent.input(number, { target: { value: "12" } });
	expect(screen.queryByText("Enter one letter and five digits.")).toBeNull();

	fireEvent.focusOut(number, { relatedTarget: document.body });
	expect(
		screen.getByText("Enter one letter and five digits.")
	).toBeInTheDocument();
	expect(number).toHaveAttribute("aria-invalid", "true");

	fireEvent.input(number, { target: { value: "12345" } });
	expect(screen.queryByText("Enter one letter and five digits.")).toBeNull();
	expect(
		screen.getByText("One letter and five digits, e.g. A00000")
	).toBeInTheDocument();
});

test("an empty asset tag shows the hint, not an error, after leaving the group", () => {
	render(() => (
		<ItemSheet open onOpenChange={() => {}} itemTypes={[chairType]} />
	));
	fireEvent.focusOut(screen.getByLabelText("Asset tag letter"), {
		relatedTarget: document.body,
	});
	expect(screen.queryByText("Enter one letter and five digits.")).toBeNull();
});

test("morph: the item's columns pair with the sheet values showing the same field", () => {
	const row = tableRowKeys(itemColumns({ types: [], categories: [] }), chair);
	expect(row.title).toBe("assetTag");
	expect(row.cells).toEqual(["typeName", "categoryName", "description"]);

	render(() => (
		<ItemSheet
			open
			onOpenChange={() => {}}
			item={chair}
			itemTypes={[chairType]}
			items={[chair]}
		/>
	));
	// The asset tag column is the row's title: it flies into the sheet title
	// (the asset tag), so the body's tag row carries no key of its own; the
	// category has no row either (it follows the type).
	expect(sheetKeys()).toEqual(["typeName", "description"]);
	const title = titleAround(screen.getByRole("heading", { name: "A00001" }));
	expect(title).not.toBeNull();
	expect(titleKeyOf(title)).toBe("");
});

test("the header shows the item's asset tag in edit mode, not 'Item'", () => {
	render(() => (
		<ItemSheet
			open
			onOpenChange={() => {}}
			item={chair}
			itemTypes={[chairType]}
		/>
	));
	expect(screen.getByRole("heading", { name: "A00001" })).toBeInTheDocument();
	expect(screen.queryByRole("heading", { name: "Item" })).toBeNull();
});

test("morph: the loading skeleton's plain-label rows carry no key", () => {
	render(() => (
		<ItemSheet open onOpenChange={() => {}} itemTypes={[]} loading />
	));
	expect(sheetSkeleton()).toBeInTheDocument();
	expect(keyedIn(document)).toHaveLength(0);
});
