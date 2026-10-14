import type { Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import type { confirmPurpose, reapplyPayload } from "../schema.ts";

import { HEX_RADIX } from "./constants.ts";

const TOKEN_BYTES = 32;

/**
 * A 256-bit opaque confirm token (hex). Uses Web Crypto, so it must be called
 * from an ACTION (or test), never a Convex mutation/query: those are
 * deterministic-replayed and forbid real randomness.
 */
export function newConfirmToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return Array.from(bytes, (byte) =>
		byte.toString(HEX_RADIX).padStart(2, "0")
	).join("");
}

/**
 * SHA-256 hex of a raw confirm token. Only this is stored, so a database
 * read (export, backup, dashboard) yields nothing a confirm link accepts.
 * Deterministic, so it is safe inside mutations.
 */
export async function hashConfirmToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token)
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(HEX_RADIX).padStart(2, "0")
	).join("");
}

export type Purpose = Infer<typeof confirmPurpose>;
export type ReapplyPayload = Infer<typeof reapplyPayload>;

/** Every answer a confirm link can give; each flow narrows it to its own. */
export type ConfirmStatus =
	| "verified"
	| "already"
	| "expired"
	| "invalid"
	| "ended";

function isLive(row: Doc<"confirmTokens">, now: number): boolean {
	return row.consumedAt === undefined && row.expiresAt > now;
}

/**
 * Store a freshly minted confirm token as its hash; the caller keeps the raw
 * `token` for the link it emails. One live token per person and
 * purpose (and per event for invites): any unconsumed row for the same key
 * is replaced, so a resend invalidates the earlier link.
 */
export async function issueToken(
	context: MutationCtx,
	args: {
		token: string;
		purpose: Purpose;
		personId: Id<"people">;
		eventId?: Id<"events">;
		ttlMs: number;
		payload?: ReapplyPayload;
		newEmail?: string;
		actorId?: Id<"people">;
	}
): Promise<Id<"confirmTokens">> {
	if (args.purpose === "eventInvite" && args.eventId === undefined) {
		throw new Error("eventInvite tokens need an eventId");
	}
	if (args.purpose === "emailChange" && args.newEmail === undefined) {
		throw new Error("emailChange tokens need a newEmail");
	}
	const prior = await context.db
		.query("confirmTokens")
		.withIndex("by_person_purpose", (range) =>
			range.eq("personId", args.personId).eq("purpose", args.purpose)
		)
		.collect();
	for (const row of prior) {
		if (row.consumedAt !== undefined) continue;
		if (args.eventId !== undefined && row.eventId !== args.eventId)
			continue;
		await context.db.delete(row._id);
	}
	return context.db.insert("confirmTokens", {
		tokenHash: await hashConfirmToken(args.token),
		purpose: args.purpose,
		personId: args.personId,
		eventId: args.eventId,
		expiresAt: Date.now() + args.ttlMs,
		payload: args.payload,
		newEmail: args.newEmail,
		actorId: args.actorId,
	});
}

export type Redeem =
	| { status: "ok"; row: Doc<"confirmTokens"> }
	| { status: "invalid" }
	| { status: "expired"; row: Doc<"confirmTokens"> }
	| { status: "already"; row: Doc<"confirmTokens"> };

/** The raw token's row, or null: the one `by_tokenHash` read every redeem uses. */
export async function tokenRow(
	database: DatabaseReader,
	token: string
): Promise<Doc<"confirmTokens"> | null> {
	const tokenHash = await hashConfirmToken(token);
	return database
		.query("confirmTokens")
		.withIndex("by_tokenHash", (range) => range.eq("tokenHash", tokenHash))
		.first();
}

/** Look a token up and consume it, in the caller's transaction. */
export async function redeemToken(
	context: MutationCtx,
	token: string,
	purpose: Purpose
): Promise<Redeem> {
	return redeemRow(context, await tokenRow(context.db, token), purpose);
}

/**
 * Consume a row already read with `tokenRow`, in the caller's transaction.
 * The consumed row stays so a repeat click is told "already" rather than
 * "invalid".
 */
export async function redeemRow(
	context: MutationCtx,
	row: Doc<"confirmTokens"> | null,
	purpose: Purpose
): Promise<Redeem> {
	if (row?.purpose !== purpose) return { status: "invalid" };
	if (row.consumedAt !== undefined) return { status: "already", row };
	const now = Date.now();
	if (row.expiresAt <= now) return { status: "expired", row };
	await context.db.patch(row._id, { consumedAt: now });
	return { status: "ok", row: { ...row, consumedAt: now } };
}

/** Every unconsumed, unexpired token for a person and purpose. */
export async function liveTokens(
	database: DatabaseReader,
	personId: Id<"people">,
	purpose: Purpose,
	now: number
): Promise<Doc<"confirmTokens">[]> {
	const rows = await database
		.query("confirmTokens")
		.withIndex("by_person_purpose", (range) =>
			range.eq("personId", personId).eq("purpose", purpose)
		)
		.collect();
	return rows.filter((row) => isLive(row, now));
}

/** Delete every unconsumed token for a person and purpose, killing its link. */
export async function revokeTokens(
	context: MutationCtx,
	personId: Id<"people">,
	purpose: Purpose
): Promise<void> {
	const rows = await context.db
		.query("confirmTokens")
		.withIndex("by_person_purpose", (range) =>
			range.eq("personId", personId).eq("purpose", purpose)
		)
		.collect();
	for (const row of rows)
		if (row.consumedAt === undefined) await context.db.delete(row._id);
}

/**
 * Derived, never stored: an unverified self-serve sign-up (prospect or
 * visitor) whose confirm link is dead. The nightly purge deletes these.
 */
export async function abandoned(
	database: DatabaseReader,
	person: Doc<"people">,
	now: number
): Promise<boolean> {
	const isSelfServe = person.tier === "prospect" || person.tier === "visitor";
	if (!isSelfServe || person.stage !== "unverified") return false;
	const purpose: Purpose =
		person.tier === "prospect" ? "application" : "visitor";
	const tokens = await liveTokens(database, person._id, purpose, now);
	return tokens.length === 0;
}

/** Delete rows past `expiresAt`, consumed or not. Returns the count. */
export async function purgeConfirmTokens(
	context: MutationCtx,
	now: number,
	batch: number
): Promise<number> {
	const expired = await context.db
		.query("confirmTokens")
		.withIndex("by_expiresAt", (range) => range.lt("expiresAt", now))
		.take(batch);
	for (const row of expired) await context.db.delete(row._id);
	return expired.length;
}
