import type { FunctionArgs } from "convex/server";

import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { normalizeEmail } from "./emailAddress.ts";
import { rateLimiter } from "./rateLimit.ts";

/** A person's sessions and accounts are a handful of rows. */
const AUTH_PAGE = 100;

type DeleteInput = FunctionArgs<
	typeof components.betterAuth.adapter.deleteMany
>["input"];

type AuthUser = { _id: string; email: string } & Record<string, unknown>;
type AuthRow = Record<string, unknown>;

/** Secrets an access export must not print: they would sign the reader in. */
const SECRET_FIELDS = [
	"token",
	"accessToken",
	"refreshToken",
	"idToken",
	"password",
];

function redact(row: AuthRow): AuthRow {
	return Object.fromEntries(
		Object.entries(row).filter(([k]) => !SECRET_FIELDS.includes(k))
	);
}

async function authUser(
	ctx: QueryCtx | MutationCtx,
	email: string
): Promise<AuthUser | null> {
	return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
		model: "user",
		where: [{ field: "email", value: normalizeEmail(email) }],
	})) as AuthUser | null;
}

async function rowsOf(
	ctx: QueryCtx,
	model: "session" | "account",
	userId: string
): Promise<AuthRow[]> {
	const { page } = (await ctx.runQuery(
		components.betterAuth.adapter.findMany,
		{
			model,
			where: [{ field: "userId", value: userId }],
			paginationOpts: { cursor: null, numItems: AUTH_PAGE },
		}
	)) as { page: AuthRow[] };
	return page.map(redact);
}

/** The sign-in records held for `email`, secrets left out. */
export async function authRecordsFor(ctx: QueryCtx, email: string) {
	const user = await authUser(ctx, email);
	if (!user) return { user: null, sessions: [], accounts: [] };
	return {
		user,
		sessions: await rowsOf(ctx, "session", user._id),
		accounts: await rowsOf(ctx, "account", user._id),
	};
}

/** Delete every auth row matching `input`, page by page. */
async function deleteAll(
	ctx: MutationCtx,
	input: DeleteInput
): Promise<number> {
	let deleted = 0;
	let cursor: string | null = null;
	for (;;) {
		const page = (await ctx.runMutation(
			components.betterAuth.adapter.deleteMany,
			{ input, paginationOpts: { cursor, numItems: AUTH_PAGE } }
		)) as { count: number; isDone: boolean; continueCursor: string };
		deleted += page.count;
		if (page.isDone) return deleted;
		cursor = page.continueCursor;
	}
}

/**
 * Delete the sign-in records for `email`: the user, its sessions and accounts,
 * any pending magic link (its `value` carries the address), and the
 * per-address rate-limit buckets keyed on it. Returns how many auth rows went.
 */
export async function eraseAuthRecords(
	ctx: MutationCtx,
	email: string
): Promise<number> {
	const address = normalizeEmail(email);
	let deleted = 0;
	const user = await authUser(ctx, address);
	if (user) {
		for (const model of ["session", "account"] as const)
			deleted += await deleteAll(ctx, {
				model,
				where: [{ field: "userId", value: user._id }],
			});
		deleted += await deleteAll(ctx, {
			model: "user",
			where: [{ field: "_id", value: user._id }],
		});
	}
	// Live links only: `expiresAt` bounds the read through its index, where
	// matching on `value` alone would scan the whole table. An expired link
	// that was never used still holds the address until Better Auth drops it.
	deleted += await deleteAll(ctx, {
		model: "verification",
		where: [
			{ field: "expiresAt", operator: "gt", value: Date.now() },
			// Quoted, as the link's JSON stores it, so `bob@example.com` does not
			// also match `jimbob@example.com`.
			{
				field: "value",
				operator: "contains",
				value: JSON.stringify(address),
			},
		],
	});
	for (const name of ["sendEmail", "magicLinkAddress"] as const)
		await rateLimiter.reset(ctx, name, { key: address });
	return deleted;
}
