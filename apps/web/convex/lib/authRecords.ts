import type { FunctionArgs } from "convex/server";

import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { normalizeEmail, peopleByEmail } from "./emailAddress.ts";
import { rateLimiter } from "./rateLimit.ts";

/** A person's sessions and accounts are a handful of rows. */
const AUTH_PAGE = 100;

type DeleteInput = FunctionArgs<
	typeof components.betterAuth.adapter.deleteMany
>["input"];

export type AuthUser = { _id: string; email: string } & Record<string, unknown>;
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

async function findAuthUser(
	context: QueryCtx | MutationCtx,
	field: "email" | "_id",
	value: string
): Promise<AuthUser | null> {
	return (await context.runQuery(components.betterAuth.adapter.findOne, {
		model: "user",
		where: [{ field, value }],
	})) as AuthUser | null;
}

async function authUser(
	context: QueryCtx | MutationCtx,
	email: string
): Promise<AuthUser | null> {
	return findAuthUser(context, "email", normalizeEmail(email));
}

/** The login with id `userId`, or null. */
export async function authUserById(
	context: QueryCtx | MutationCtx,
	userId: string
): Promise<AuthUser | null> {
	return findAuthUser(context, "_id", userId);
}

/** One page of logins, for a migration to walk. */
export async function authUsersPage(
	context: QueryCtx | MutationCtx,
	cursor: string | null,
	numberItems: number
): Promise<{ page: AuthUser[]; isDone: boolean; continueCursor: string }> {
	return (await context.runQuery(components.betterAuth.adapter.findMany, {
		model: "user",
		paginationOpts: { cursor, numItems: numberItems },
	})) as { page: AuthUser[]; isDone: boolean; continueCursor: string };
}

export type LinkOutcome = "linked" | "unchanged" | "noPerson" | "ambiguous";

const HOLDERS_TO_READ = 2;
const LOGIN_HOLDERS_TO_READ = 2;

async function unlinkLogin(
	context: MutationCtx,
	userId: string
): Promise<void> {
	const holders = await context.db
		.query("people")
		.withIndex("by_authUserId", (range) => range.eq("authUserId", userId))
		.take(LOGIN_HOLDERS_TO_READ);
	for (const holder of holders)
		await context.db.patch(holder._id, { authUserId: undefined });
}

/**
 * Link `user` to the person who holds its email. Runs when someone signs in,
 * which proves they own the address, so matching on email is the claim step.
 * Any other person still carrying this login loses it first, so one login
 * names one person. Several people on one address are left unlinked: the
 * board resolves those with a merge.
 */
export async function linkLogin(
	context: MutationCtx,
	user: AuthUser,
	options: { dryRun?: boolean } = {}
): Promise<LinkOutcome> {
	const holders = await peopleByEmail(context, user.email).take(
		HOLDERS_TO_READ
	);
	if (holders.length === 0) return "noPerson";
	if (holders.length > 1) return "ambiguous";
	const [person] = holders;
	if (person.authUserId === user._id) return "unchanged";
	if (options.dryRun === true) return "linked";
	await unlinkLogin(context, user._id);
	await context.db.patch(person._id, { authUserId: user._id });
	return "linked";
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

/** Delete login `userId` with its sessions and accounts. Returns how many auth
 *  rows went. */
export async function eraseLogin(
	context: MutationCtx,
	userId: string
): Promise<number> {
	let deleted = 0;
	for (const model of ["session", "account"] as const)
		deleted += await deleteAll(context, {
			model,
			where: [{ field: "userId", value: userId }],
		});
	deleted += await deleteAll(context, {
		model: "user",
		where: [{ field: "_id", value: userId }],
	});
	return deleted;
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
	if (user) deleted += await eraseLogin(context, user._id);
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

/**
 * Move login `userId` to `email`. Another login already on that address is
 * erased first (with its sessions): no person holds the address, since email
 * is unique among people, so nobody signs in with it. A login that no longer
 * exists is dropped from the people linked to it instead.
 */
export async function renameLogin(
	context: MutationCtx,
	userId: string,
	email: string
): Promise<void> {
	if (!(await authUserById(context, userId))) {
		await unlinkLogin(context, userId);
		return;
	}
	const address = normalizeEmail(email);
	const holder = await authUser(context, address);
	if (holder && holder._id !== userId) {
		await eraseAuthRecords(context, address);
		await unlinkLogin(context, holder._id);
	}
	await context.runMutation(components.betterAuth.adapter.updateOne, {
		input: {
			model: "user",
			where: [{ field: "_id", value: userId }],
			update: { email: address, updatedAt: Date.now() },
		},
	});
}
