// @vitest-environment happy-dom
import { type JfColumnDef } from "@j-os/design-system";
import { expect, test } from "vitest";

import { actionsColumnSize } from "../../community/columns/RowActions.tsx";

import { categoryColumns } from "./categoryColumns.tsx";
import { DESCRIPTION_SIZE } from "./columnSizes.ts";
import { itemColumns } from "./itemColumns.tsx";
import { itemTypeColumns } from "./itemTypeColumns.tsx";

const rows = [
	{
		_id: "i1",
		_creationTime: 0,
		typeId: "t1",
		assetTag: "A00001",
		typeName: "Chair",
		categoryId: "c1",
		categoryName: "Furniture",
	},
	{
		_id: "i2",
		_creationTime: 0,
		typeId: "t2",
		assetTag: "A00002",
		typeName: "Kettle",
		categoryId: "c2",
		categoryName: "Kitchen",
		description: "Shared",
	},
] as const;

test("item columns expose type and category as enum filters", () => {
	const columns = itemColumns([...rows] as unknown as Parameters<
		typeof itemColumns
	>[0]);
	const type = columns.find((c) => c.header === "Type") as JfColumnDef<
		Record<string, unknown>
	>;
	const category = columns.find(
		(c) => c.header === "Category"
	) as JfColumnDef<Record<string, unknown>>;
	expect(type.dataType).toBe("enum");
	expect(type.enumOptions).toEqual([
		{ label: "Chair", value: "Chair" },
		{ label: "Kettle", value: "Kettle" },
	]);
	expect(category.dataType).toBe("enum");
	expect(category.enumOptions).toEqual([
		{ label: "Furniture", value: "Furniture" },
		{ label: "Kitchen", value: "Kitchen" },
	]);
});

test("free-text descriptions share the leftover width instead of growing to fit", () => {
	const items = itemColumns([...rows] as unknown as Parameters<
		typeof itemColumns
	>[0]);
	const types = itemTypeColumns([]);
	const categories = categoryColumns();
	for (const columns of [items, types, categories]) {
		expect(columns.find((c) => c.id === "description")).toMatchObject({
			size: DESCRIPTION_SIZE,
			measureText: false,
		});
	}
});

test("the item actions column is a display column with a fixed width", () => {
	const actions = itemColumns([]).find((c) => c.id === "actions");
	expect(actions?.size).toBe(actionsColumnSize(2));
	expect(actions).not.toHaveProperty("dataType");
	expect(actions).not.toHaveProperty("enableSorting");
	expect(actions).not.toHaveProperty("enableColumnFilter");
});
