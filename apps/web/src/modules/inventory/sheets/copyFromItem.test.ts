import { expect, test } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { Item } from "../data/inventoryData.ts";

import { detailsFromItem, filterItemsByAssetTag } from "./copyFromItem.ts";

const TYPE_CHAIR = "itemTypes:chair" as Id<"itemTypes">;
const TYPE_KETTLE = "itemTypes:kettle" as Id<"itemTypes">;
const CATEGORY = "itemCategories:furniture" as Id<"itemCategories">;

function item(
	partial: Partial<Item> & Pick<Item, "assetTag" | "typeId">
): Item {
	return {
		_id: "items:1" as Item["_id"],
		_creationTime: 0,
		typeName: "Chair",
		categoryId: CATEGORY,
		categoryName: "Furniture",
		...partial,
	};
}

const chair = item({
	_id: "items:chair" as Item["_id"],
	assetTag: "A00001",
	typeId: TYPE_CHAIR,
	typeName: "Chair",
	description: "Meeting room",
});

const kettle = item({
	_id: "items:kettle" as Item["_id"],
	assetTag: "B00002",
	typeId: TYPE_KETTLE,
	typeName: "Kettle",
	categoryName: "Kitchen",
});

test("filterItemsByAssetTag matches a substring of the asset tag", () => {
	expect(filterItemsByAssetTag([chair, kettle], "00001")).toEqual([chair]);
});

test("filterItemsByAssetTag is case-insensitive", () => {
	expect(filterItemsByAssetTag([chair, kettle], "a000")).toEqual([chair]);
});

test("filterItemsByAssetTag does not match type names", () => {
	expect(filterItemsByAssetTag([chair, kettle], "Chair")).toEqual([]);
});

test("filterItemsByAssetTag returns every item when the query is empty", () => {
	expect(filterItemsByAssetTag([chair, kettle], "")).toEqual([chair, kettle]);
	expect(filterItemsByAssetTag([chair, kettle], "   ")).toEqual([
		chair,
		kettle,
	]);
});

test("detailsFromItem copies type and description and omits the asset tag", () => {
	expect(detailsFromItem(chair)).toEqual({
		typeId: TYPE_CHAIR,
		description: "Meeting room",
	});
	expect(detailsFromItem(chair)).not.toHaveProperty("assetTag");
});

test("detailsFromItem uses an empty description when the source has none", () => {
	expect(detailsFromItem(kettle)).toEqual({
		typeId: TYPE_KETTLE,
		description: "",
	});
});
