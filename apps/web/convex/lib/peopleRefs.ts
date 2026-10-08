import type { ValidatorJSON } from "convex/values";

import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema.ts";

/** Most documents one merge or erasure may read across its walks (one
 *  Convex transaction reads at most 16,384 documents and 8 MiB). */
export const MAX_SCANNED_DOCS = 8000;

/** True when a value of this shape can hold a person id. `any` counts: it
 *  could hold one, so a future `any` field cannot hide ids from the merge. */
function holdsPeopleId(json: ValidatorJSON): boolean {
	switch (json.type) {
		case "any":
			return true;
		case "id":
			return json.tableName === "people";
		case "object":
			return Object.values(json.value).some((f) =>
				holdsPeopleId(f.fieldType)
			);
		case "array":
			return holdsPeopleId(json.value);
		case "union":
			return json.value.some(holdsPeopleId);
		case "record":
			return holdsPeopleId(json.values.fieldType);
		default:
			return false;
	}
}

/** Every table whose documents can hold a person id, read from the schema
 *  itself so a new reference field cannot be missed by the merge. */
export function peopleRefTables(): string[] {
	return Object.entries(schema.tables)
		.filter(([, table]) => holdsPeopleId(jsonOf(table)))
		.map(([name]) => name);
}

/** Deep-replace a person id anywhere in a document value. An array that named
 *  both people keeps the kept id once (`tasks.assigneeIds`). */
export function replacePersonId<T>(
	value: T,
	dropId: string,
	keepId: string
): { value: T; changed: boolean } {
	let changed = false;
	function walk(x: unknown): unknown {
		if (x === dropId) {
			changed = true;
			return keepId;
		}
		if (Array.isArray(x)) {
			const out = x.map(walk);
			return x.includes(dropId)
				? out.filter((v, i) => v !== keepId || out.indexOf(v) === i)
				: out;
		}
		if (x !== null && typeof x === "object")
			return Object.fromEntries(
				Object.entries(x).map(([k, v]) => [k, walk(v)])
			);
		return x;
	}
	return { value: walk(value) as T, changed };
}

/** Deep-remove a person id from a document value: an array drops the entry,
 *  an object drops the key that held it. Erasure's counterpart to
 *  {@link replacePersonId}. */
export function stripPersonId<T>(
	value: T,
	id: string
): { value: T; changed: boolean } {
	let changed = false;
	function walk(x: unknown): unknown {
		if (Array.isArray(x))
			return x
				.filter((v) => {
					if (v !== id) return true;
					changed = true;
					return false;
				})
				.map(walk);
		if (x !== null && typeof x === "object")
			return Object.fromEntries(
				Object.entries(x)
					.filter(([, v]) => {
						if (v !== id) return true;
						changed = true;
						return false;
					})
					.map(([k, v]) => [k, walk(v)])
			);
		return x;
	}
	return { value: walk(value) as T, changed };
}

function jsonOf(table: { validator: unknown }): ValidatorJSON {
	return (table.validator as { json: ValidatorJSON }).json;
}

export type RefLookup = { index: string; field: string };

/** How the merge finds the documents of one table that name a person: `index`
 *  is one lookup per listed field, `scan` reads the whole table. */
export type RefPlan =
	| { mode: "index"; lookups: RefLookup[] }
	| { mode: "scan" };

type PlannedTable = {
	validator: unknown;
	" indexes"(): { indexDescriptor: string; fields: string[] }[];
};

/**
 * Index lookups are exact only when EVERY location that can hold a person id
 * is a top-level id field that leads some index. A nested id, a union, or an
 * `any` anywhere in the table makes the plan a scan.
 */
function planFor(table: PlannedTable): RefPlan {
	const json = jsonOf(table);
	if (json.type !== "object") return { mode: "scan" };
	const indexes = table[" indexes"]();
	const lookups: RefLookup[] = [];
	for (const [field, { fieldType }] of Object.entries(json.value)) {
		if (!holdsPeopleId(fieldType)) continue;
		const index = indexes.find((i) => i.fields[0] === field);
		if (fieldType.type !== "id" || !index) return { mode: "scan" };
		lookups.push({ index: index.indexDescriptor, field });
	}
	return { mode: "index", lookups };
}

/** How each table that can hold a person id is searched. */
export function peopleRefPlans(): Record<string, RefPlan> {
	const tables = schema.tables as Record<string, PlannedTable>;
	return Object.fromEntries(
		peopleRefTables().map((name) => [name, planFor(tables[name])])
	);
}

/** A table queried by name and index name, which the typed API cannot express. */
type NamedIndexQuery = {
	withIndex(
		name: string,
		range: (q: { eq(field: string, value: unknown): unknown }) => unknown
	): { take(n: number): Promise<Doc<"people">[]> };
};

/** A document that may name a person, with the table it lives in. */
export type Naming = { table: TableNames; doc: Doc<"people"> };

/** Documents one transaction may still read, shared by every walk in it. */
export type ReadBudget = { left: number };

/** A fresh budget of {@link MAX_SCANNED_DOCS} reads. */
export function readBudget(): ReadBudget {
	return { left: MAX_SCANNED_DOCS };
}

/** Why a walk stopped before reading past its budget. */
export function overBudget(table: string): string {
	return `Too many documents to scan in one transaction (more than ${MAX_SCANNED_DOCS}, reached in ${table}).`;
}

/** The rows of `query`, charged to `budget`, or null when there are more
 *  than it has left. */
export async function takeCharged<T>(
	query: { take(n: number): Promise<T[]> },
	budget: ReadBudget
): Promise<T[] | null> {
	const rows = await query.take(budget.left + 1);
	if (rows.length > budget.left) return null;
	budget.left -= rows.length;
	return rows;
}

/**
 * Every document that may name `personId`: index lookups where the schema plan
 * allows them, a full read elsewhere. Every read, index or scan, is charged to
 * `budget`, which a caller walking several people in one transaction shares,
 * so a walk that would cross the transaction's read limit is refused here,
 * before anything is written, rather than failing midway.
 * Typed as people documents only to share one walk; each is written back
 * through its own id, so the table is never lost.
 */
export async function documentsNaming(
	ctx: QueryCtx,
	personId: Id<"people">,
	budget: ReadBudget = readBudget()
): Promise<{ problem: string } | { docs: Naming[] }> {
	const docs = new Map<string, Naming>();
	for (const [name, plan] of Object.entries(peopleRefPlans())) {
		const table = name as TableNames;
		const reads =
			plan.mode === "index"
				? plan.lookups.map(({ index, field }) =>
						(
							ctx.db.query(
								table as "people"
							) as unknown as NamedIndexQuery
						).withIndex(index, (q) => q.eq(field, personId))
					)
				: [ctx.db.query(table as "people")];
		for (const read of reads) {
			const rows = await takeCharged(read, budget);
			if (!rows) return { problem: overBudget(table) };
			for (const doc of rows) docs.set(doc._id, { table, doc });
		}
	}
	return { docs: [...docs.values()] };
}

/** The dotted paths inside `value` that hold `id` (`assigneeIds.1`,
 *  `board.noteLog.0.authorId`). */
export function pathsNaming(value: unknown, id: string, at = ""): string[] {
	if (value === id) return [at];
	if (value === null || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([k, v]) =>
		pathsNaming(v, id, at ? `${at}.${k}` : k)
	);
}
