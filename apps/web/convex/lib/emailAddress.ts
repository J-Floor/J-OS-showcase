import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * The canonical form of an email address: trimmed and lowercased. `people.email`
 * is the identity key (`by_email` + `.unique()`), so every writer stores this
 * form and every lookup passes its input through it — otherwise `Foo@example.com` and
 * `foo@example.com` are two different people. The rate limiter keys on it too, so
 * casing variants of one inbox share one bucket.
 */
export function normalizeEmail(email: string): string {
	// eslint-disable-next-line no-restricted-syntax -- identity / rate-limit key (business logic), not UI display text
	return email.trim().toLowerCase();
}

/**
 * The `people` rows on `email`'s `by_email` key, normalized first so no lookup
 * can forget to. Use it directly only where duplicates are expected (collision
 * checks, purges, migrations); everyone else wants {@link personByEmail}.
 */
export function peopleByEmail(ctx: QueryCtx, email: string) {
	return ctx.db
		.query("people")
		.withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)));
}

/** The one person whose identity key is `email`, or null. Throws on duplicates. */
export async function personByEmail(
	ctx: QueryCtx,
	email: string
): Promise<Doc<"people"> | null> {
	return peopleByEmail(ctx, email).unique();
}

/** A basic address shape check: rejects garbage in an email field (a venture
 *  name leaked into it, say) before it reaches a mail provider or an identity key. */
export function validEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Refusal shown when an email is already some other person's identity key. */
export const EMAIL_IN_USE = "Another person already uses that email address.";

/** Refusal shown when an edited email is not an address at all. */
export const EMAIL_INVALID = "That is not a valid email address.";

/** The groups of rows sharing one email once normalized; singletons left out. */
export function groupByNormalizedEmail<T extends { email: string }>(
	rows: T[]
): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const key = normalizeEmail(row.email);
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	for (const [key, group] of groups) if (group.length < 2) groups.delete(key);
	return groups;
}
