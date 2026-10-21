import { err, ok, type Result } from "neverthrow";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { normalizeEmail, peopleByEmail } from "./emailAddress.ts";
import type { PeopleError } from "./errors/people.ts";
import { type Naming, type ReadBudget, takeCharged } from "./peopleRefs.ts";

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
): Promise<Result<string[], PeopleError>> {
	const own = [];
	for (const address of addresses) {
		const holders = await takeCharged(
			peopleByEmail(context, address),
			budget,
			"people"
		);
		if (holders.isErr()) return err(holders.error);
		if (holders.value.every((holder) => ids.has(holder._id)))
			own.push(address);
	}
	return ok(own);
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
): Promise<Result<Doc<"doorLog">[], PeopleError>> {
	const rows = [];
	for (const address of addresses) {
		const found = await takeCharged(
			context.db
				.query("doorLog")
				.withIndex("by_email", (range) => range.eq("email", address)),
			budget,
			"doorLog"
		);
		if (found.isErr()) return err(found.error);
		rows.push(...found.value.filter((row) => row.personId === undefined));
	}
	return ok(rows);
}
