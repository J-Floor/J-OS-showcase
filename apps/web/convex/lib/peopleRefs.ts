import type { ValidatorJSON } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import schema from "../schema.ts";

import type { PeopleError } from "./errors/people.ts";

/** Most documents one merge or erasure may read across its walks (one
 *  Convex transaction reads at most 16,384 documents and 8 MiB). */
export const MAX_SCANNED_DOCS = 8000;

/** True when a value of this shape can hold a person id. `any` counts: it
 *  could hold one, so a future `any` field cannot hide ids from the merge. */
function canHoldPeopleId(json: ValidatorJSON): boolean {
	switch (json.type) {
		case "any":
			return true;
		case "id":
			return json.tableName === "people";
		case "object":
			return Object.values(json.value).some((field) =>
				canHoldPeopleId(field.fieldType)
			);
		case "array":
			return canHoldPeopleId(json.value);
		case "union":
			return json.value.some((member) => canHoldPeopleId(member));
		case "record":
			return canHoldPeopleId(json.values.fieldType);
		default:
			return false;
	}
}

/** Every table whose documents can hold a person id, read from the schema
 *  itself so a new reference field cannot be missed by the merge. */
export function peopleReferenceTables(): string[] {
	return Object.entries(schema.tables)
		.filter(([, table]) => canHoldPeopleId(jsonOf(table)))
		.map(([name]) => name);
}

/** Deep-replace a person id anywhere in a document value. An array that named
 *  both people keeps the kept id once (`tasks.assigneeIds`). */
export function replacePersonId<T>(
	value: T,
	dropId: string,
	keepId: string
): { value: T; changed: boolean } {
	let isChanged = false;
	function walk(node: unknown): unknown {
		if (node === dropId) {
			isChanged = true;
			return keepId;
		}
		if (Array.isArray(node)) {
			const out = node.map((item) => walk(item));
			return node.includes(dropId)
				? out.filter(
						(entry, index) =>
							entry !== keepId || out.indexOf(entry) === index
					)
				: out;
		}
		return node !== null && typeof node === "object"
			? Object.fromEntries(
					Object.entries(node).map(([key, child]) => [
						key,
						walk(child),
					])
				)
			: node;
	}
	return { value: walk(value) as T, changed: isChanged };
}

/** Deep-remove a person id from a document value: an array drops the entry,
 *  an object drops the key that held it. Erasure's counterpart to
 *  {@link replacePersonId}. */
export function stripPersonId<T>(
	value: T,
	id: string
): { value: T; changed: boolean } {
	let isChanged = false;
	function walk(node: unknown): unknown {
		if (Array.isArray(node))
			return node
				.filter((entry) => {
					if (entry !== id) return true;
					isChanged = true;
					return false;
				})
				.map((item) => walk(item));
		if (node !== null && typeof node === "object")
			return Object.fromEntries(
				Object.entries(node)
					.filter(([, child]) => {
						if (child !== id) return true;
						isChanged = true;
						return false;
					})
					.map(([key, child]) => [key, walk(child)])
			);
		return node;
	}
	return { value: walk(value) as T, changed: isChanged };
}

function jsonOf(table: { validator: unknown }): ValidatorJSON {
	return (table.validator as { json: ValidatorJSON }).json;
}

type ReferenceLookup = { index: string; field: string };

/** How the merge finds the documents of one table that name a person: `index`
 *  is one lookup per listed field, `scan` reads the whole table. */
type ReferencePlan =
	| { mode: "index"; lookups: ReferenceLookup[] }
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
function planFor(table: PlannedTable): ReferencePlan {
	const json = jsonOf(table);
	if (json.type !== "object") return { mode: "scan" };
	const indexes = table[" indexes"]();
	const lookups: ReferenceLookup[] = [];
	for (const [field, { fieldType }] of Object.entries(json.value)) {
		if (!canHoldPeopleId(fieldType)) continue;
		const index = indexes.find(
			(candidate) => candidate.fields[0] === field
		);
		if (fieldType.type !== "id" || !index) return { mode: "scan" };
		lookups.push({ index: index.indexDescriptor, field });
	}
	return { mode: "index", lookups };
}

/** How each table that can hold a person id is searched. */
export function peopleReferencePlans(): Record<string, ReferencePlan> {
	const tables = schema.tables as Record<string, PlannedTable>;
	return Object.fromEntries(
		peopleReferenceTables().map((name) => [name, planFor(tables[name])])
	);
}

/** A table queried by name and index name, which the typed API cannot express. */
type NamedIndexQuery = {
	withIndex(
		name: string,
		range: (range: {
			eq(field: string, value: unknown): unknown;
		}) => unknown
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

/** The rows of `query`, charged to `budget`, or a refusal when there are
 *  more than it has left. `where` names the table for the operator's log. */
export async function takeCharged<T>(
	query: { take(n: number): Promise<T[]> },
	budget: ReadBudget,
	where: string
): Promise<Result<T[], PeopleError>> {
	const rows = await query.take(budget.left + 1);
	if (rows.length > budget.left)
		return err({ type: "ReadBudgetExceeded", where });
	budget.left -= rows.length;
	return ok(rows);
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
	context: QueryCtx,
	personId: Id<"people">,
	budget: ReadBudget = readBudget()
): Promise<Result<Naming[], PeopleError>> {
	const documentsById = new Map<string, Naming>();
	for (const [name, plan] of Object.entries(peopleReferencePlans())) {
		const table = name as TableNames;
		const reads =
			plan.mode === "index"
				? plan.lookups.map(({ index, field }) =>
						(
							context.db.query(
								table as "people"
							) as unknown as NamedIndexQuery
						).withIndex(index, (range) => range.eq(field, personId))
					)
				: [context.db.query(table as "people")];
		for (const read of reads) {
			const rows = await takeCharged(read, budget, table);
			if (rows.isErr()) return err(rows.error);
			for (const doc of rows.value)
				documentsById.set(doc._id, { table, doc });
		}
	}
	return ok([...documentsById.values()]);
}

/** The dotted paths inside `value` that hold `id` (`assigneeIds.1`,
 *  `board.noteLog.0.authorId`). */
export function pathsNaming(value: unknown, id: string, at = ""): string[] {
	if (value === id) return [at];
	return value === null || typeof value !== "object"
		? []
		: Object.entries(value).flatMap(([key, child]) =>
				pathsNaming(child, id, at ? `${at}.${key}` : key)
			);
}
