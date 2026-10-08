import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

const BOARD_EMAIL = "boss@example.com";
const MEMBER_EMAIL = "m@example.com";

async function seedBoard(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: BOARD_EMAIL,
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: BOARD_EMAIL });
}

async function seedMember(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: MEMBER_EMAIL,
			firstName: "M",
			lastName: "",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t.withIdentity({ email: MEMBER_EMAIL });
}

async function seedCategory(
	asBoard: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
	name = "Furniture"
): Promise<Id<"itemCategories">> {
	return asBoard.mutation(api.inventory.createCategory, { name });
}

async function seedType(
	asBoard: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
	categoryId: Id<"itemCategories">,
	name = "Chair"
): Promise<Id<"itemTypes">> {
	return asBoard.mutation(api.inventory.createItemType, {
		name,
		categoryId,
	});
}

describe("auth", () => {
	it("rejects a member on every inventory query and mutation", async () => {
		const t = convexTest(schema, modules);
		const asMember = await seedMember(t);
		await expect(
			asMember.query(api.inventory.listCategories, {})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asMember.query(api.inventory.listItemTypes, {})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asMember.query(api.inventory.listItems, {})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asMember.query(api.inventory.getItemByAssetTag, {
				assetTag: "A00001",
			})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asMember.mutation(api.inventory.createCategory, { name: "X" })
		).rejects.toThrow(/Forbidden/);
	});

	it("rejects a member on the drawer list queries", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const asMember = await seedMember(t);
		const categoryId = await seedCategory(asBoard);
		const typeId = await seedType(asBoard, categoryId);
		await expect(
			asMember.query(api.inventory.listItemTypesByCategory, {
				categoryId,
			})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asMember.query(api.inventory.listItemsByType, { typeId })
		).rejects.toThrow(/Forbidden/);
	});
});

describe("categories", () => {
	it("creates, lists, updates, and deletes a category", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const id = await asBoard.mutation(api.inventory.createCategory, {
			name: "  Kitchen  ",
			description: "  Shared appliances  ",
		});
		const listed = await asBoard.query(api.inventory.listCategories, {});
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			_id: id,
			name: "Kitchen",
			description: "Shared appliances",
		});

		await asBoard.mutation(api.inventory.updateCategory, {
			id,
			name: "Pantry",
			description: "",
		});
		const after = await asBoard.query(api.inventory.listCategories, {});
		expect(after[0]).toMatchObject({ name: "Pantry" });
		expect(after[0].description).toBeUndefined();

		await asBoard.mutation(api.inventory.removeCategory, { id });
		expect(await asBoard.query(api.inventory.listCategories, {})).toEqual(
			[]
		);
	});

	it("rejects a blank name and a duplicate name", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		await expect(
			asBoard.mutation(api.inventory.createCategory, { name: "   " })
		).rejects.toThrow(/Name is required/);
		await asBoard.mutation(api.inventory.createCategory, { name: "IT" });
		await expect(
			asBoard.mutation(api.inventory.createCategory, { name: "IT" })
		).rejects.toThrow(/already uses that name/);
	});

	it("lists only the item types that belong to the given category", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const av = await seedCategory(asBoard, "AV");
		const it = await seedCategory(asBoard, "IT");
		await seedType(asBoard, av, "Projector");
		await seedType(asBoard, it, "Router");
		await seedType(asBoard, it, "Cable");

		const avTypes = await asBoard.query(
			api.inventory.listItemTypesByCategory,
			{ categoryId: av }
		);
		expect(avTypes).toEqual([
			expect.objectContaining({ name: "Projector" }),
		]);

		const itTypes = await asBoard.query(
			api.inventory.listItemTypesByCategory,
			{ categoryId: it }
		);
		expect(itTypes.map((row) => row.name)).toEqual(["Cable", "Router"]);
	});

	it("returns an empty list for a category with no item types", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard);
		expect(
			await asBoard.query(api.inventory.listItemTypesByCategory, {
				categoryId,
			})
		).toEqual([]);
	});

	it("refuses to delete a category that still has item types", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard);
		await seedType(asBoard, categoryId);
		await expect(
			asBoard.mutation(api.inventory.removeCategory, { id: categoryId })
		).rejects.toThrow(/item type/);
	});

	it("still blocks the delete with a capped count once item types exceed the guard's display cap", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard);
		// One more than the guard's display cap (20): the existence check now
		// reads with `.take()`, not `.collect()`, so this must still block the
		// delete without reading the whole table — and the message caps at
		// "20+" rather than the exact (uncounted) total.
		for (let i = 0; i < 21; i++) {
			await seedType(asBoard, categoryId, `Type ${String(i)}`);
		}
		await expect(
			asBoard.mutation(api.inventory.removeCategory, { id: categoryId })
		).rejects.toThrow(/20\+ item types still use it/);
	});
});

describe("item types", () => {
	it("creates with a denormalized category name and updates", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard, "AV");
		const id = await asBoard.mutation(api.inventory.createItemType, {
			name: "Projector",
			categoryId,
			description: "HDMI",
		});
		const listed = await asBoard.query(api.inventory.listItemTypes, {});
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			_id: id,
			name: "Projector",
			categoryName: "AV",
			description: "HDMI",
		});

		const other = await seedCategory(asBoard, "IT");
		await asBoard.mutation(api.inventory.updateItemType, {
			id,
			name: "Beamer",
			categoryId: other,
			description: null,
		});
		const after = await asBoard.query(api.inventory.listItemTypes, {});
		expect(after[0]).toMatchObject({
			name: "Beamer",
			categoryName: "IT",
		});
		expect(after[0].description).toBeUndefined();
	});

	it("rejects a duplicate name inside the same category, allows it in another", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const av = await seedCategory(asBoard, "AV");
		const it = await seedCategory(asBoard, "IT");
		await asBoard.mutation(api.inventory.createItemType, {
			name: "Cable",
			categoryId: av,
		});
		await expect(
			asBoard.mutation(api.inventory.createItemType, {
				name: "Cable",
				categoryId: av,
			})
		).rejects.toThrow(/already uses that name/);
		await expect(
			asBoard.mutation(api.inventory.createItemType, {
				name: "Cable",
				categoryId: it,
			})
		).resolves.toBeTypeOf("string");
	});

	it("refuses to delete a type that still has items", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard);
		const typeId = await seedType(asBoard, categoryId);
		await asBoard.mutation(api.inventory.createItem, {
			typeId,
			assetTag: "A00001",
		});
		await expect(
			asBoard.mutation(api.inventory.removeItemType, { id: typeId })
		).rejects.toThrow(/item/);
	});

	it("still blocks the delete with a capped count once items exceed the guard's display cap", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard);
		const typeId = await seedType(asBoard, categoryId);
		// One more than the guard's display cap (20): the existence check now
		// reads with `.take()`, not `.collect()`.
		for (let i = 0; i < 21; i++) {
			await asBoard.mutation(api.inventory.createItem, {
				typeId,
				assetTag: `A${String(i).padStart(5, "0")}`,
			});
		}
		await expect(
			asBoard.mutation(api.inventory.removeItemType, { id: typeId })
		).rejects.toThrow(/20\+ items still use it/);
	});
});

describe("items", () => {
	it("creates with denormalized type and category names", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard, "Furniture");
		const typeId = await seedType(asBoard, categoryId, "Chair");
		const id = await asBoard.mutation(api.inventory.createItem, {
			typeId,
			assetTag: " a00001 ",
			description: "Red",
		});
		const listed = await asBoard.query(api.inventory.listItems, {});
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			_id: id,
			assetTag: "A00001",
			typeName: "Chair",
			categoryId,
			categoryName: "Furniture",
			description: "Red",
		});
	});

	it("rejects a malformed tag and a duplicate tag", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const typeId = await seedType(asBoard, await seedCategory(asBoard));
		await expect(
			asBoard.mutation(api.inventory.createItem, {
				typeId,
				assetTag: "nope",
			})
		).rejects.toThrow(/A00000/);
		await asBoard.mutation(api.inventory.createItem, {
			typeId,
			assetTag: "B00001",
		});
		await expect(
			asBoard.mutation(api.inventory.createItem, {
				typeId,
				assetTag: "B00001",
			})
		).rejects.toThrow(/already uses that asset tag/);
	});

	it("updates the type and tag, then deletes the item", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const furniture = await seedCategory(asBoard, "Furniture");
		const chair = await seedType(asBoard, furniture, "Chair");
		const table = await seedType(asBoard, furniture, "Table");
		const id = await asBoard.mutation(api.inventory.createItem, {
			typeId: chair,
			assetTag: "C00001",
		});
		await asBoard.mutation(api.inventory.updateItem, {
			id,
			typeId: table,
			assetTag: "C00002",
			description: "Oak",
		});
		const listed = await asBoard.query(api.inventory.listItems, {});
		expect(listed[0]).toMatchObject({
			typeName: "Table",
			assetTag: "C00002",
			description: "Oak",
		});
		await asBoard.mutation(api.inventory.removeItem, { id });
		expect(await asBoard.query(api.inventory.listItems, {})).toEqual([]);
	});

	it("looks up an item by asset tag, including trimmed lowercase input", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const categoryId = await seedCategory(asBoard, "Furniture");
		const typeId = await seedType(asBoard, categoryId, "Chair");
		const id = await asBoard.mutation(api.inventory.createItem, {
			typeId,
			assetTag: "A00001",
		});
		const found = await asBoard.query(api.inventory.getItemByAssetTag, {
			assetTag: " a00001 ",
		});
		expect(found).toMatchObject({
			_id: id,
			assetTag: "A00001",
			typeName: "Chair",
			categoryId,
			categoryName: "Furniture",
		});
	});

	it("lists only the items that belong to the given type", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const furniture = await seedCategory(asBoard, "Furniture");
		const chair = await seedType(asBoard, furniture, "Chair");
		const table = await seedType(asBoard, furniture, "Table");
		await asBoard.mutation(api.inventory.createItem, {
			typeId: chair,
			assetTag: "A00002",
		});
		await asBoard.mutation(api.inventory.createItem, {
			typeId: chair,
			assetTag: "A00001",
		});
		await asBoard.mutation(api.inventory.createItem, {
			typeId: table,
			assetTag: "B00001",
		});

		const chairItems = await asBoard.query(api.inventory.listItemsByType, {
			typeId: chair,
		});
		expect(chairItems.map((row) => row.assetTag)).toEqual([
			"A00001",
			"A00002",
		]);

		const tableItems = await asBoard.query(api.inventory.listItemsByType, {
			typeId: table,
		});
		expect(tableItems.map((row) => row.assetTag)).toEqual(["B00001"]);
	});

	it("returns an empty list for a type with no items", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		const typeId = await seedType(asBoard, await seedCategory(asBoard));
		expect(
			await asBoard.query(api.inventory.listItemsByType, { typeId })
		).toEqual([]);
	});

	it("returns null for an unused tag and rejects a malformed one", async () => {
		const t = convexTest(schema, modules);
		const asBoard = await seedBoard(t);
		expect(
			await asBoard.query(api.inventory.getItemByAssetTag, {
				assetTag: "Z00099",
			})
		).toBeNull();
		await expect(
			asBoard.query(api.inventory.getItemByAssetTag, {
				assetTag: "nope",
			})
		).rejects.toThrow(/A00000/);
	});
});
