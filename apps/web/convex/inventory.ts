import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { parseAssetTag } from "./lib/assetTag.ts";
import { requireRole } from "./lib/authGuard.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";

export type ItemTypeRow = Doc<"itemTypes"> & { categoryName: string };
export type ItemRow = Doc<"items"> & {
	typeName: string;
	categoryId: Id<"itemCategories">;
	categoryName: string;
};

function requireName(raw: string): string {
	const name = raw.trim();
	if (name === "") throw new Error("Name is required.");
	return name;
}

function optionalText(raw: string | null | undefined): string | undefined {
	if (raw == null) return undefined;
	const text = raw.trim();
	return text === "" ? undefined : text;
}

async function assertCategoryNameFree(
	ctx: QueryCtx,
	name: string,
	except?: Id<"itemCategories">
): Promise<void> {
	const clash = await ctx.db
		.query("itemCategories")
		.withIndex("by_name", (q) => q.eq("name", name))
		.unique();
	if (clash && clash._id !== except)
		throw new Error("Another category already uses that name.");
}

async function assertTypeNameFree(
	ctx: QueryCtx,
	categoryId: Id<"itemCategories">,
	name: string,
	except?: Id<"itemTypes">
): Promise<void> {
	const clash = await ctx.db
		.query("itemTypes")
		.withIndex("by_category_and_name", (q) =>
			q.eq("categoryId", categoryId).eq("name", name)
		)
		.unique();
	if (clash && clash._id !== except)
		throw new Error(
			"Another item type in this category already uses that name."
		);
}

async function assertAssetTagFree(
	ctx: QueryCtx,
	assetTag: string,
	except?: Id<"items">
): Promise<void> {
	const clash = await ctx.db
		.query("items")
		.withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
		.unique();
	if (clash && clash._id !== except)
		throw new Error("Another item already uses that asset tag.");
}

async function requireCategory(
	ctx: QueryCtx,
	id: Id<"itemCategories">
): Promise<Doc<"itemCategories">> {
	const row = await ctx.db.get(id);
	if (!row) throw new Error("Category not found.");
	return row;
}

async function requireItemType(
	ctx: QueryCtx,
	id: Id<"itemTypes">
): Promise<Doc<"itemTypes">> {
	const row = await ctx.db.get(id);
	if (!row) throw new Error("Item type not found.");
	return row;
}

async function requireItem(
	ctx: QueryCtx,
	id: Id<"items">
): Promise<Doc<"items">> {
	const row = await ctx.db.get(id);
	if (!row) throw new Error("Item not found.");
	return row;
}

function byName<T extends { name: string }>(a: T, b: T): number {
	return a.name.localeCompare(b.name);
}

/** A drawer just lists what belongs to its parent — bound the read so a
 *  category/type with a huge number of children can't blow a query's read
 *  limit. */
const DRAWER_LIST_CAP = 200;

/** A delete guard only needs to know "is this empty" and, for the message, a
 *  rough count — never the whole child table. Cap the probe at
 *  `DELETE_GUARD_CAP + 1` rows so a category/type with thousands of children
 *  can't blow a mutation's read limit. */
const DELETE_GUARD_CAP = 20;

function guardCountLabel(n: number): string {
	return n > DELETE_GUARD_CAP ? `${String(DELETE_GUARD_CAP)}+` : String(n);
}

async function enrichItem(
	ctx: QueryCtx,
	row: Doc<"items">
): Promise<ItemRow | null> {
	const type = await ctx.db.get(row.typeId);
	if (!type) return null;
	const category = await ctx.db.get(type.categoryId);
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
	handler: async (ctx): Promise<Doc<"itemCategories">[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db.query("itemCategories").collect();
		return rows.sort(byName);
	},
});

export const createCategory = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"itemCategories">> => {
		await requireRole(ctx, BOARD_LEVEL);
		const name = requireName(args.name);
		await assertCategoryNameFree(ctx, name);
		return ctx.db.insert("itemCategories", {
			name,
			description: optionalText(args.description),
		});
	},
});

export const updateCategory = mutation({
	args: {
		id: v.id("itemCategories"),
		name: v.optional(v.string()),
		description: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireCategory(ctx, args.id);
		const patch: {
			name?: string;
			description?: string | undefined;
		} = {};
		if (args.name !== undefined) {
			const name = requireName(args.name);
			await assertCategoryNameFree(ctx, name, args.id);
			patch.name = name;
		}
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await ctx.db.patch(args.id, patch);
		return null;
	},
});

export const removeCategory = mutation({
	args: { id: v.id("itemCategories") },
	handler: async (ctx, { id }): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireCategory(ctx, id);
		const types = await ctx.db
			.query("itemTypes")
			.withIndex("by_category", (q) => q.eq("categoryId", id))
			.take(DELETE_GUARD_CAP + 1);
		if (types.length > 0) {
			const n = types.length;
			throw new Error(
				`Cannot delete category: ${guardCountLabel(n)} item type${n === 1 ? "" : "s"} still use it.`
			);
		}
		await ctx.db.delete(id);
		return null;
	},
});

export const listItemTypes = query({
	args: {},
	handler: async (ctx): Promise<ItemTypeRow[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db.query("itemTypes").collect();
		const out: ItemTypeRow[] = [];
		for (const row of rows) {
			const category = await ctx.db.get(row.categoryId);
			if (!category) continue;
			out.push({ ...row, categoryName: category.name });
		}
		return out.sort(byName);
	},
});

export const listItemTypesByCategory = query({
	args: { categoryId: v.id("itemCategories") },
	handler: async (
		ctx,
		{ categoryId }
	): Promise<Pick<Doc<"itemTypes">, "_id" | "name">[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db
			.query("itemTypes")
			.withIndex("by_category", (q) => q.eq("categoryId", categoryId))
			.take(DRAWER_LIST_CAP);
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
	handler: async (ctx, args): Promise<Id<"itemTypes">> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireCategory(ctx, args.categoryId);
		const name = requireName(args.name);
		await assertTypeNameFree(ctx, args.categoryId, name);
		return ctx.db.insert("itemTypes", {
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
		description: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		const existing = await requireItemType(ctx, args.id);
		const categoryId = args.categoryId ?? existing.categoryId;
		if (args.categoryId !== undefined)
			await requireCategory(ctx, args.categoryId);
		const name =
			args.name !== undefined ? requireName(args.name) : existing.name;
		if (name !== existing.name || categoryId !== existing.categoryId)
			await assertTypeNameFree(ctx, categoryId, name, args.id);
		const patch: {
			name?: string;
			categoryId?: Id<"itemCategories">;
			description?: string | undefined;
		} = {};
		if (args.name !== undefined) patch.name = name;
		if (args.categoryId !== undefined) patch.categoryId = categoryId;
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await ctx.db.patch(args.id, patch);
		return null;
	},
});

export const removeItemType = mutation({
	args: { id: v.id("itemTypes") },
	handler: async (ctx, { id }): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireItemType(ctx, id);
		const items = await ctx.db
			.query("items")
			.withIndex("by_type", (q) => q.eq("typeId", id))
			.take(DELETE_GUARD_CAP + 1);
		if (items.length > 0) {
			const n = items.length;
			throw new Error(
				`Cannot delete item type: ${guardCountLabel(n)} item${n === 1 ? "" : "s"} still use it.`
			);
		}
		await ctx.db.delete(id);
		return null;
	},
});

export const listItems = query({
	args: {},
	handler: async (ctx): Promise<ItemRow[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db.query("items").collect();
		const out: ItemRow[] = [];
		for (const row of rows) {
			const enriched = await enrichItem(ctx, row);
			if (enriched) out.push(enriched);
		}
		return out.sort((a, b) => a.assetTag.localeCompare(b.assetTag));
	},
});

export const listItemsByType = query({
	args: { typeId: v.id("itemTypes") },
	handler: async (
		ctx,
		{ typeId }
	): Promise<Pick<Doc<"items">, "_id" | "assetTag">[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db
			.query("items")
			.withIndex("by_type", (q) => q.eq("typeId", typeId))
			.take(DRAWER_LIST_CAP);
		return rows
			.map((row) => ({ _id: row._id, assetTag: row.assetTag }))
			.sort((a, b) => a.assetTag.localeCompare(b.assetTag));
	},
});

export const getItemByAssetTag = query({
	args: { assetTag: v.string() },
	handler: async (ctx, args): Promise<ItemRow | null> => {
		await requireRole(ctx, BOARD_LEVEL);
		const assetTag = parseAssetTag(args.assetTag);
		const row = await ctx.db
			.query("items")
			.withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
			.unique();
		if (!row) return null;
		return enrichItem(ctx, row);
	},
});

export const createItem = mutation({
	args: {
		typeId: v.id("itemTypes"),
		assetTag: v.string(),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<Id<"items">> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireItemType(ctx, args.typeId);
		const assetTag = parseAssetTag(args.assetTag);
		await assertAssetTagFree(ctx, assetTag);
		return ctx.db.insert("items", {
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
		description: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, args): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireItem(ctx, args.id);
		if (args.typeId !== undefined) await requireItemType(ctx, args.typeId);
		const patch: {
			typeId?: Id<"itemTypes">;
			assetTag?: string;
			description?: string | undefined;
		} = {};
		if (args.typeId !== undefined) patch.typeId = args.typeId;
		if (args.assetTag !== undefined) {
			const assetTag = parseAssetTag(args.assetTag);
			await assertAssetTagFree(ctx, assetTag, args.id);
			patch.assetTag = assetTag;
		}
		if (args.description !== undefined)
			patch.description = optionalText(args.description);
		await ctx.db.patch(args.id, patch);
		return null;
	},
});

export const removeItem = mutation({
	args: { id: v.id("items") },
	handler: async (ctx, { id }): Promise<null> => {
		await requireRole(ctx, BOARD_LEVEL);
		await requireItem(ctx, id);
		await ctx.db.delete(id);
		return null;
	},
});
