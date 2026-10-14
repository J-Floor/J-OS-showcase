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
export function addressesOf(
	person: Doc<"people">,
	documents: Naming[]
): string[] {
	const found: unknown[] = [person.email];
	for (const { table, doc } of documents) {
		if (!ownedBy(doc, person._id)) continue;
		if (table === "personEvents") {
			const personEvent = doc as unknown as Doc<"personEvents">;
			if (
				personEvent.kind === "field_edit" &&
				personEvent.field === "email"
			)
				found.push(personEvent.before, personEvent.after);
		}
		if (table === "confirmTokens") {
			const token = doc as unknown as Doc<"confirmTokens">;
			if (
				token.purpose === "emailChange" &&
				token.consumedAt !== undefined
			)
				found.push(token.newEmail);
		}
	}
	return [
		...new Set(
			found
				.filter(
					(address): address is string => typeof address === "string"
				)
				.map((address) => normalizeEmail(address))
		),
	];
}

/**
 * Of `addresses`, the ones no one outside `ids` holds now: sign-in records and
 * address-only door rows under an address someone else took over may be
 * theirs, so they are left alone.
 */
export async function addressesHeldBy(
	context: QueryCtx,
	addresses: string[],
	ids: Set<string>,
	budget: ReadBudget
): Promise<{ problem: string } | { addresses: string[] }> {
	const own = [];
	for (const address of addresses) {
		const holders = await takeCharged(
			peopleByEmail(context, address),
			budget
		);
		if (!holders) return { problem: overBudget("people") };
		if (holders.every((holder) => ids.has(holder._id))) own.push(address);
	}
	return { addresses: own };
}

/**
 * Door-log rows written before `personId` was stored, found by address. A row
 * that carries a `personId` is never one of these: the walk finds the
 * person's own by id, and one naming anybody else is theirs.
 */
export async function legacyDoorRows(
	context: QueryCtx,
	addresses: string[],
	budget: ReadBudget
): Promise<{ problem: string } | { rows: Doc<"doorLog">[] }> {
	const rows = [];
	for (const address of addresses) {
		const found = await takeCharged(
			context.db
				.query("doorLog")
				.withIndex("by_email", (range) => range.eq("email", address)),
			budget
		);
		if (!found) return { problem: overBudget("doorLog") };
		rows.push(...found.filter((row) => row.personId === undefined));
	}
	return { rows };
}
