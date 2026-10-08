import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { normalizeEmail, peopleByEmail } from "./emailAddress.ts";
import {
	type Naming,
	overBudget,
	type ReadBudget,
	takeCharged,
} from "./peopleRefs.ts";

/** True when `doc` is the person's own record (`personId` is theirs). */
export function ownedBy(doc: object, personId: string): boolean {
	return (doc as { personId?: string }).personId === personId;
}

/**
 * Every address `person` has used, read from what the walk found before
 * anything is deleted: the current one, both sides of each email change in
 * their own history, and the address each confirmed email-change token moved
 * them to.
 */
export function addressesOf(person: Doc<"people">, docs: Naming[]): string[] {
	const found: unknown[] = [person.email];
	for (const { table, doc } of docs) {
		if (!ownedBy(doc, person._id)) continue;
		if (table === "personEvents") {
			const e = doc as unknown as Doc<"personEvents">;
			if (e.kind === "field_edit" && e.field === "email")
				found.push(e.before, e.after);
		}
		if (table === "confirmTokens") {
			const t = doc as unknown as Doc<"confirmTokens">;
			if (t.purpose === "emailChange" && t.consumedAt !== undefined)
				found.push(t.newEmail);
		}
	}
	return [
		...new Set(
			found
				.filter((a): a is string => typeof a === "string")
				.map(normalizeEmail)
		),
	];
}

/**
 * Of `addresses`, the ones no one outside `ids` holds now: sign-in records and
 * address-only door rows under an address someone else took over may be
 * theirs, so they are left alone.
 */
export async function addressesHeldBy(
	ctx: QueryCtx,
	addresses: string[],
	ids: Set<string>,
	budget: ReadBudget
): Promise<{ problem: string } | { addresses: string[] }> {
	const own = [];
	for (const address of addresses) {
		const holders = await takeCharged(peopleByEmail(ctx, address), budget);
		if (!holders) return { problem: overBudget("people") };
		if (holders.every((p) => ids.has(p._id))) own.push(address);
	}
	return { addresses: own };
}

/**
 * Door-log rows written before `personId` was stored, found by address. A row
 * that carries a `personId` is never one of these: the walk finds the
 * person's own by id, and one naming anybody else is theirs.
 */
export async function legacyDoorRows(
	ctx: QueryCtx,
	addresses: string[],
	budget: ReadBudget
): Promise<{ problem: string } | { rows: Doc<"doorLog">[] }> {
	const rows = [];
	for (const address of addresses) {
		const found = await takeCharged(
			ctx.db
				.query("doorLog")
				.withIndex("by_email", (q) => q.eq("email", address)),
			budget
		);
		if (!found) return { problem: overBudget("doorLog") };
		rows.push(...found.filter((r) => r.personId === undefined));
	}
	return { rows };
}
