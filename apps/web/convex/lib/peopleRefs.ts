import type { ValidatorJSON } from "convex/values";

import schema from "../schema.ts";

/** Most documents one merge may read across the tables it must scan in full
 *  (one Convex transaction reads at most 16,384 documents and 8 MiB). */
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
