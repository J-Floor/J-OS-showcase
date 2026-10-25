// @vitest-environment happy-dom
import {
	actionsColumnSize,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";

import { categoryColumns } from "./categoryColumns.tsx";
import { DESCRIPTION_SIZE } from "./columnSizes.ts";
import { createItemColumns, itemColumns } from "./itemColumns.tsx";
import { createItemTypeColumns, itemTypeColumns } from "./itemTypeColumns.tsx";

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

const NO_OPTIONS = { types: [], categories: [] };

type ItemRows = Parameters<typeof createItemColumns>[0] extends () => infer R
	? R
	: never;
type TypeRows = Parameters<
	typeof createItemTypeColumns
>[0] extends () => infer R
	? R
	: never;

test("item columns expose type and category as enum filters", () => {
	const columns = createRoot((dispose) => {
		const built = createItemColumns(() => rows as unknown as ItemRows)();
		dispose();
		return built;
	});
	const type = columns.find(
		(column) => column.header === "Type"
	) as JfColumnDefinition<Record<string, unknown>>;
	const category = columns.find(
		(column) => column.header === "Category"
	) as JfColumnDefinition<Record<string, unknown>>;
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
	const items = itemColumns(NO_OPTIONS);
	const types = itemTypeColumns(NO_OPTIONS);
	const categories = categoryColumns();
	for (const columns of [items, types, categories]) {
		expect(
			columns.find((column) => column.id === "description")
		).toMatchObject({
			size: DESCRIPTION_SIZE,
			measureText: false,
		});
	}
});

function enumOptionsOf<Row extends Record<string, unknown>>(
	columns: readonly JfColumnDefinition<Row>[],
	header: string
): unknown {
	return (
		columns.find((column) => column.header === header) as
			| JfColumnDefinition<Record<string, unknown>>
			| undefined
	)?.enumOptions;
}

test("item columns change only when their options do: a push with the same types and categories keeps them", () => {
	createRoot((dispose) => {
		const [items, setItems] = createSignal(rows as unknown as ItemRows);
		const columns = createItemColumns(items);
		const first = columns();
		setItems(
			rows.map((row) => ({
				...row,
				description: "Edited",
			})) as unknown as ItemRows
		);
		expect(columns()).toBe(first);
		setItems([
			...rows,
			{ ...rows[0], _id: "i3", typeName: "Desk" },
		] as unknown as ItemRows);
		expect(columns()).not.toBe(first);
		expect(enumOptionsOf(columns(), "Type")).toEqual([
			{ label: "Chair", value: "Chair" },
			{ label: "Desk", value: "Desk" },
			{ label: "Kettle", value: "Kettle" },
		]);
		dispose();
	});
});

test("item type columns change only when their category options do", () => {
	const types = [
		{ _id: "t1", name: "Chair", categoryName: "Furniture" },
		{ _id: "t2", name: "Kettle", categoryName: "Kitchen" },
	];
	createRoot((dispose) => {
		const [rowsNow, setRows] = createSignal(types as unknown as TypeRows);
		const columns = createItemTypeColumns(rowsNow);
		const first = columns();
		setRows(types.map((type) => ({ ...type })) as unknown as TypeRows);
		expect(columns()).toBe(first);
		setRows([
			...types,
			{ _id: "t3", name: "Lamp", categoryName: "Lighting" },
		] as unknown as TypeRows);
		expect(columns()).not.toBe(first);
		dispose();
	});
});

test("the item actions column is a display column with a fixed width", () => {
	const actions = itemColumns(NO_OPTIONS).find(
		(column) => column.id === "actions"
	);
	expect(actions?.size).toBe(actionsColumnSize(2));
	expect(actions).not.toHaveProperty("dataType");
	expect(actions).not.toHaveProperty("enableSorting");
	expect(actions).not.toHaveProperty("enableColumnFilter");
});
