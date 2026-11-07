import {
	type EnumOption,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { type Accessor, createMemo } from "solid-js";

import { actionsColumn } from "../../../shared/actions/actionsColumn.ts";
import type { Item } from "../data/inventoryData.ts";
import { itemFields } from "../fields.ts";

import { InventoryRowActions } from "./InventoryRowActions.tsx";
import { descriptionColumn } from "./sharedColumns.ts";
import { createEnumOptions } from "./uniqueEnum.ts";

const ITEM_ACTION_COUNT = 2;

export function itemColumns(options: {
	types: EnumOption[];
	categories: EnumOption[];
	canManage: boolean;
}): JfColumnDefinition<Item>[] {
	return [
		fieldColumn(itemFields.assetTag, {
			accessorKey: "assetTag",
			dataType: "string",
		}),
		fieldColumn(itemFields.typeName, {
			accessorKey: "typeName",
			dataType: "enum",
			enumOptions: options.types,
		}),
		fieldColumn(itemFields.categoryName, {
			accessorKey: "categoryName",
			dataType: "enum",
			enumOptions: options.categories,
		}),
		descriptionColumn<Item>(itemFields.description),
		...actionsColumn<Item>({
			count: options.canManage ? ITEM_ACTION_COUNT : 0,
			cell: (info) => <InventoryRowActions row={info.row.original} />,
		}),
	];
}

/** The tab's columns, rebuilt when the filter options or the viewer's
 *  permission change, not on every push of the rows. */
export function createItemColumns(
	rows: Accessor<readonly Item[]>,
	canManage: Accessor<boolean>
): Accessor<JfColumnDefinition<Item>[]> {
	const types = createEnumOptions(() => rows().map((row) => row.typeName));
	const categories = createEnumOptions(() =>
		rows().map((row) => row.categoryName)
	);
	const columns = createMemo(() =>
		itemColumns({
			types: types(),
			categories: categories(),
			canManage: canManage(),
		})
	);
	return columns;
}
