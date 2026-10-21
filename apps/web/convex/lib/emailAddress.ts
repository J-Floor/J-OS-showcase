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
export function peopleByEmail(context: QueryCtx, email: string) {
	return context.db
		.query("people")
		.withIndex("by_email", (range) =>
			range.eq("email", normalizeEmail(email))
		);
}

/** The one person whose identity key is `email`, or null. Throws on duplicates. */
export async function personByEmail(
	context: QueryCtx,
	email: string
): Promise<Doc<"people"> | null> {
	return peopleByEmail(context, email).unique();
}

const EMAIL_PART = /^[^\s@]+$/;

/** A basic address shape check: rejects garbage in an email field (a venture
 *  name leaked into it, say) before it reaches a mail provider or an identity key. */
export function validEmail(email: string): boolean {
	const parts = email.split("@");
	if (parts.length !== 2) return false;
	const [local, domain] = parts;
	return (
		EMAIL_PART.test(local) &&
		EMAIL_PART.test(domain) &&
		domain.slice(1, -1).includes(".")
	);
}

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
