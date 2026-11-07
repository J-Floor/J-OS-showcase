// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

import type { Item } from "../data/inventoryData.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";

const item = {
	_id: "items:chair",
	_creationTime: 0,
	assetTag: "A00001",
	typeId: "itemTypes:chair",
	typeName: "Chair",
	categoryId: "itemCategories:furniture",
	categoryName: "Furniture",
} as unknown as Item;

test("an item row offers copy link and download QR", () => {
	render(() => <InventoryRowActions row={item} />);
	expect(
		screen.getByRole("button", { name: "Copy link" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Download QR" })
	).toBeInTheDocument();
});
