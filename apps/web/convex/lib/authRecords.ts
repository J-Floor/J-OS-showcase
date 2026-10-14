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
		Object.entries(row).filter(([key]) => !SECRET_FIELDS.includes(key))
	);
}

async function authUser(
	context: QueryCtx | MutationCtx,
	email: string
): Promise<AuthUser | null> {
	return (await context.runQuery(components.betterAuth.adapter.findOne, {
		model: "user",
		where: [{ field: "email", value: normalizeEmail(email) }],
	})) as AuthUser | null;
}

async function rowsOf(
	context: QueryCtx,
	model: "session" | "account",
	userId: string
): Promise<AuthRow[]> {
	const { page } = (await context.runQuery(
		components.betterAuth.adapter.findMany,
		{
			model,
			where: [{ field: "userId", value: userId }],
			paginationOpts: { cursor: null, numItems: AUTH_PAGE },
		}
	)) as { page: AuthRow[] };
	return page.map((row) => redact(row));
}

/** The sign-in records held for `email`, secrets left out. */
export async function authRecordsFor(context: QueryCtx, email: string) {
	const user = await authUser(context, email);
	if (!user) return { user: null, sessions: [], accounts: [] };
	return {
		user,
		sessions: await rowsOf(context, "session", user._id),
		accounts: await rowsOf(context, "account", user._id),
	};
}

/** Delete every auth row matching `input`, page by page. */
async function deleteAll(
	context: MutationCtx,
	input: DeleteInput
): Promise<number> {
	let deleted = 0;
	let cursor: string | null = null;
	for (;;) {
		const page = (await context.runMutation(
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
	context: MutationCtx,
	email: string
): Promise<number> {
	const address = normalizeEmail(email);
	let deleted = 0;
	const user = await authUser(context, address);
	if (user) {
		for (const model of ["session", "account"] as const)
			deleted += await deleteAll(context, {
				model,
				where: [{ field: "userId", value: user._id }],
			});
		deleted += await deleteAll(context, {
			model: "user",
			where: [{ field: "_id", value: user._id }],
		});
	}
	// Live links only: `expiresAt` bounds the read through its index, where
	// matching on `value` alone would scan the whole table. An expired link
	// that was never used still holds the address until Better Auth drops it.
	deleted += await deleteAll(context, {
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
		await rateLimiter.reset(context, name, { key: address });
	return deleted;
}
