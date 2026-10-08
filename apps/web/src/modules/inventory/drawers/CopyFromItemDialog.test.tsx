// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { Item } from "../data/inventoryData.ts";

import { CopyFromItemDialog } from "./CopyFromItemDialog.tsx";

afterEach(cleanup);

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const TYPE_CHAIR = "itemTypes:chair" as Id<"itemTypes">;
const TYPE_KETTLE = "itemTypes:kettle" as Id<"itemTypes">;
const CATEGORY = "itemCategories:furniture" as Id<"itemCategories">;

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

const kettle: Item = {
	_id: "items:kettle" as Item["_id"],
	_creationTime: 0,
	assetTag: "B00002",
	typeId: TYPE_KETTLE,
	typeName: "Kettle",
	categoryId: CATEGORY,
	categoryName: "Kitchen",
};

function renderDialog(
	overrides: Partial<Parameters<typeof CopyFromItemDialog>[0]> = {}
) {
	const onSelect = vi.fn();
	const onOpenChange = vi.fn();
	render(() => (
		<CopyFromItemDialog
			open
			onOpenChange={onOpenChange}
			items={[chair, kettle]}
			onSelect={onSelect}
			{...overrides}
		/>
	));
	return { onSelect, onOpenChange };
}

test("each row shows the asset tag next to the item type", () => {
	renderDialog();
	expect(
		screen.getByRole("button", { name: "A00001 Chair" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "B00002 Kettle" })
	).toBeInTheDocument();
});

test("typing in the asset tag field narrows the list by tag", () => {
	renderDialog();
	fireEvent.input(screen.getByLabelText("Asset tag"), {
		target: { value: "A000" },
	});
	expect(
		screen.getByRole("button", { name: "A00001 Chair" })
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "B00002 Kettle" })
	).not.toBeInTheDocument();
});

test("a type name is not enough to match a row", () => {
	renderDialog();
	fireEvent.input(screen.getByLabelText("Asset tag"), {
		target: { value: "Chair" },
	});
	expect(screen.getByText("No matching asset tags")).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "A00001 Chair" })
	).not.toBeInTheDocument();
});

test("choosing a row calls onSelect with that item", () => {
	const { onSelect, onOpenChange } = renderDialog();
	fireEvent.click(screen.getByRole("button", { name: "A00001 Chair" }));
	expect(onSelect).toHaveBeenCalledTimes(1);
	expect(onSelect).toHaveBeenCalledWith(chair);
	expect(onOpenChange).toHaveBeenCalledWith(false);
});
