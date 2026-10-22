import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { parseAssetTag } from "./lib/assetTag.ts";
import { requireRole } from "./lib/authGuard.ts";
import type { InventoryError } from "./lib/errors/inventory.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";

export type ItemTypeRow = Doc<"itemTypes"> & { categoryName: string };
export type ItemRow = Doc<"items"> & {
	typeName: string;
	categoryId: Id<"itemCategories">;
	categoryName: string;
};

/** An update's text field: a string sets it, null clears it, absent leaves it. */
const editableText = v.optional(v.union(v.string(), v.null()));

function requireName(raw: string): Result<string, InventoryError> {
	const name = raw.trim();
	return name === "" ? err({ type: "NameRequired" }) : ok(name);
}

function optionalText(raw: string | null | undefined): string | undefined {
	if (raw === null || raw === undefined) return undefined;
	const text = raw.trim();
	return text === "" ? undefined : text;
}

async function assertCategoryNameFree(
	context: QueryCtx,
	name: string,
	except?: Id<"itemCategories">
): Promise<Result<void, InventoryError>> {
	const clash = await context.db
		.query("itemCategories")
		.withIndex("by_name", (range) => range.eq("name", name))
		.unique();
	return clash && clash._id !== except
		? err({ type: "CategoryNameTaken" })
		: ok();
}

async function assertTypeNameFree(
	context: QueryCtx,
	categoryId: Id<"itemCategories">,
	name: string,
	except?: Id<"itemTypes">
): Promise<Result<void, InventoryError>> {
	const clash = await context.db
		.query("itemTypes")
		.withIndex("by_category_and_name", (range) =>
			range.eq("categoryId", categoryId).eq("name", name)
		)
		.unique();
	return clash && clash._id !== except
		? err({ type: "ItemTypeNameTaken" })
		: ok();
}

async function assertAssetTagFree(
	context: QueryCtx,
	assetTag: string,
	except?: Id<"items">
): Promise<Result<void, InventoryError>> {
	const clash = await context.db
		.query("items")
		.withIndex("by_assetTag", (range) => range.eq("assetTag", assetTag))
		.unique();
	return clash && clash._id !== except
		? err({ type: "AssetTagTaken" })
		: ok();
}

async function requireCategory(
	context: QueryCtx,
	id: Id<"itemCategories">
): Promise<Doc<"itemCategories">> {
	const row = await context.db.get(id);
	invariant(row, "Category not found.");
	return row;
}

async function requireItemType(
	context: QueryCtx,
	id: Id<"itemTypes">
): Promise<Doc<"itemTypes">> {
	const row = await context.db.get(id);
	invariant(row, "Item type not found.");
	return row;
}

async function requireItem(
	context: QueryCtx,
	id: Id<"items">
): Promise<Doc<"items">> {
	const row = await context.db.get(id);
	invariant(row, "Item not found.");
	return row;
}

/* eslint-disable id-length -- conventional comparator parameter names */
function byName<T extends { name: string }>(a: T, b: T): number {
	return a.name.localeCompare(b.name);
}
/* eslint-enable id-length -- conventional comparator parameter names */

/** A sheet just lists what belongs to its parent — bound the read so a
 *  category/type with a huge number of children can't blow a query's read
 *  limit. */
const SHEET_LIST_CAP = 200;

/** A delete guard only needs to know whether any child exists. */
const DELETE_GUARD_PROBE = 1;

async function enrichItem(
	context: QueryCtx,
	row: Doc<"items">
): Promise<ItemRow | null> {
	const type = await context.db.get(row.typeId);
	if (!type) return null;
	const category = await context.db.get(type.categoryId);
	if (!category) return null;
	return {
		...row,
		typeName: type.name,
		categoryId: type.categoryId,
		categoryName: category.name,
	};
}

export const listCategories = query({
	args: {},
	handler: async (context): Promise<Doc<"itemCategories">[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db.query("itemCategories").collect();
		return rows.sort(byName);
	},
});

export const createCategory = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (context, args): Promise<Id<"itemCategories">> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const name = unwrap(requireName(args.name));
		unwrap(await assertCategoryNameFree(context, name));
		return context.db.insert("itemCategories", {
			name,
			description: optionalText(args.description),
		});
	},
});

export const updateCategory = mutation({
	args: {
		id: v.id("itemCategories"),
		name: v.optional(v.string()),
		description: editableText,
	},
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireCategory(context, args.id);
		const patch: {
			name?: string;
			description?: string;
		} = {};
		if (args.name !== undefined) {
			const name = unwrap(requireName(args.name));
			unwrap(await assertCategoryNameFree(context, name, args.id));
			patch.name = name;
		}
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await context.db.patch(args.id, patch);
		return null;
	},
});

export const removeCategory = mutation({
	args: { id: v.id("itemCategories") },
	handler: async (context, { id }): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireCategory(context, id);
		const types = await context.db
			.query("itemTypes")
			.withIndex("by_category", (range) => range.eq("categoryId", id))
			.take(DELETE_GUARD_PROBE);
		if (types.length > 0) refuse({ type: "CategoryNotEmpty" });
		await context.db.delete(id);
		return null;
	},
});

export const listItemTypes = query({
	args: {},
	handler: async (context): Promise<ItemTypeRow[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db.query("itemTypes").collect();
		const out: ItemTypeRow[] = [];
		for (const row of rows) {
			const category = await context.db.get(row.categoryId);
			if (!category) continue;
			out.push({ ...row, categoryName: category.name });
		}
		return out.sort(byName);
	},
});

export const listItemTypesByCategory = query({
	args: { categoryId: v.id("itemCategories") },
	handler: async (
		context,
		{ categoryId }
	): Promise<Pick<Doc<"itemTypes">, "_id" | "name">[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db
			.query("itemTypes")
			.withIndex("by_category", (range) =>
				range.eq("categoryId", categoryId)
			)
			.take(SHEET_LIST_CAP);
		return rows
			.map((row) => ({ _id: row._id, name: row.name }))
			.sort(byName);
	},
});

export const createItemType = mutation({
	args: {
		name: v.string(),
		categoryId: v.id("itemCategories"),
		description: v.optional(v.string()),
	},
	handler: async (context, args): Promise<Id<"itemTypes">> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireCategory(context, args.categoryId);
		const name = unwrap(requireName(args.name));
		unwrap(await assertTypeNameFree(context, args.categoryId, name));
		return context.db.insert("itemTypes", {
			name,
			categoryId: args.categoryId,
			description: optionalText(args.description),
		});
	},
});

export const updateItemType = mutation({
	args: {
		id: v.id("itemTypes"),
		name: v.optional(v.string()),
		categoryId: v.optional(v.id("itemCategories")),
		description: editableText,
	},
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const existing = await requireItemType(context, args.id);
		const categoryId = args.categoryId ?? existing.categoryId;
		if (args.categoryId !== undefined)
			await requireCategory(context, args.categoryId);
		const name =
			args.name === undefined
				? existing.name
				: unwrap(requireName(args.name));
		if (name !== existing.name || categoryId !== existing.categoryId)
			unwrap(
				await assertTypeNameFree(context, categoryId, name, args.id)
			);
		const patch: {
			name?: string;
			categoryId?: Id<"itemCategories">;
			description?: string;
		} = {};
		if (args.name !== undefined) patch.name = name;
		if (args.categoryId !== undefined) patch.categoryId = categoryId;
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await context.db.patch(args.id, patch);
		return null;
	},
});

export const removeItemType = mutation({
	args: { id: v.id("itemTypes") },
	handler: async (context, { id }): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireItemType(context, id);
		const items = await context.db
			.query("items")
			.withIndex("by_type", (range) => range.eq("typeId", id))
			.take(DELETE_GUARD_PROBE);
		if (items.length > 0) refuse({ type: "ItemTypeNotEmpty" });
		await context.db.delete(id);
		return null;
	},
});

export const listItems = query({
	args: {},
	handler: async (context): Promise<ItemRow[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db.query("items").collect();
		const out: ItemRow[] = [];
		for (const row of rows) {
			const enriched = await enrichItem(context, row);
			if (enriched) out.push(enriched);
		}
		// eslint-disable-next-line id-length -- conventional comparator parameter names
		return out.sort((a, b) => a.assetTag.localeCompare(b.assetTag));
	},
});

export const listItemsByType = query({
	args: { typeId: v.id("itemTypes") },
	handler: async (
		context,
		{ typeId }
	): Promise<Pick<Doc<"items">, "_id" | "assetTag">[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db
			.query("items")
			.withIndex("by_type", (range) => range.eq("typeId", typeId))
			.take(SHEET_LIST_CAP);
		return (
			rows
				.map((row) => ({ _id: row._id, assetTag: row.assetTag }))
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.assetTag.localeCompare(b.assetTag))
		);
	},
});

export const getItemByAssetTag = query({
	args: { assetTag: v.string() },
	handler: async (context, args): Promise<ItemRow | null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const assetTag = unwrap(parseAssetTag(args.assetTag));
		const row = await context.db
			.query("items")
			.withIndex("by_assetTag", (range) => range.eq("assetTag", assetTag))
			.unique();
		return row ? enrichItem(context, row) : null;
	},
});

export const createItem = mutation({
	args: {
		typeId: v.id("itemTypes"),
		assetTag: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (context, args): Promise<Id<"items">> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireItemType(context, args.typeId);
		const assetTag = unwrap(parseAssetTag(args.assetTag));
		unwrap(await assertAssetTagFree(context, assetTag));
		return context.db.insert("items", {
			typeId: args.typeId,
			assetTag,
			description: optionalText(args.description),
		});
	},
});

export const updateItem = mutation({
	args: {
		id: v.id("items"),
		typeId: v.optional(v.id("itemTypes")),
		assetTag: v.optional(v.string()),
		description: editableText,
	},
	handler: async (context, args): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireItem(context, args.id);
		if (args.typeId !== undefined)
			await requireItemType(context, args.typeId);
		const patch: {
			typeId?: Id<"itemTypes">;
			assetTag?: string;
			description?: string;
		} = {};
		if (args.typeId !== undefined) patch.typeId = args.typeId;
		if (args.assetTag !== undefined) {
			const assetTag = unwrap(parseAssetTag(args.assetTag));
			unwrap(await assertAssetTagFree(context, assetTag, args.id));
			patch.assetTag = assetTag;
		}
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await context.db.patch(args.id, patch);
		return null;
	},
});

export const removeItem = mutation({
	args: { id: v.id("items") },
	handler: async (context, { id }): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await requireItem(context, id);
		await context.db.delete(id);
		return null;
	},
});
