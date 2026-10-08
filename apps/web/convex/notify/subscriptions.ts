import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation } from "../_generated/server";
import { requireRole } from "../lib/authGuard.ts";
import { personForCurrentUser } from "../lib/currentPerson.ts";
import { COMMUNITY_TIERS } from "../lib/roles.ts";

const PUSH_HOST_ALLOWLIST = [
	"fcm.googleapis.com",
	".push.apple.com",
	".push.services.mozilla.com",
	".notify.windows.com",
];
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 256;
const MAX_AUTH_LENGTH = 64;
export const MAX_SUBSCRIPTIONS_PER_PERSON = 10;

function isAllowedHost(hostname: string): boolean {
	return PUSH_HOST_ALLOWLIST.some((entry) =>
		entry.startsWith(".") ? hostname.endsWith(entry) : hostname === entry
	);
}

/** The server POSTs to this URL, so it must be a real push service. */
function assertValidSubscription(args: {
	endpoint: string;
	p256dh: string;
	auth: string;
}): void {
	const { endpoint, p256dh, auth } = args;
	if (
		endpoint.length > MAX_ENDPOINT_LENGTH ||
		p256dh.length > MAX_P256DH_LENGTH ||
		auth.length > MAX_AUTH_LENGTH
	) {
		throw new Error("Invalid push endpoint");
	}
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new Error("Invalid push endpoint");
	}
	if (url.protocol !== "https:" || !isAllowedHost(url.hostname)) {
		throw new Error("Invalid push endpoint");
	}
}

async function trimToCap(ctx: MutationCtx, personId: Id<"people">) {
	const rows = await ctx.db
		.query("pushSubscriptions")
		.withIndex("by_person", (q) => q.eq("personId", personId))
		.collect();
	const excess = rows.length - MAX_SUBSCRIPTIONS_PER_PERSON;
	if (excess <= 0) return;
	const oldest = [...rows]
		.sort((a, b) => a.createdAt - b.createdAt)
		.slice(0, excess);
	for (const row of oldest) await ctx.db.delete(row._id);
}

async function byEndpoint(ctx: MutationCtx, endpoint: string) {
	return ctx.db
		.query("pushSubscriptions")
		.withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
		.unique();
}

/**
 * Register this device for push. Upserts by endpoint: the endpoint identifies
 * the browser, not the person, so on a shared device it moves to whoever
 * enabled push last, and the previous person stops receiving there. An
 * endpoint is a capability URL (unguessable, held only by that browser), so
 * whoever presents it owns the device: re-assigning on re-subscribe is by
 * design. The row's `createdAt` is refreshed so the per-person cap trim never
 * drops the device that was just registered.
 */
export const subscribe = mutation({
	args: {
		endpoint: v.string(),
		p256dh: v.string(),
		auth: v.string(),
		userAgent: v.string(),
	},
	handler: async (ctx, args): Promise<null> => {
		const person = await requireRole(ctx, COMMUNITY_TIERS);
		assertValidSubscription(args);
		const existing = await byEndpoint(ctx, args.endpoint);
		if (existing) {
			await ctx.db.patch(existing._id, {
				personId: person._id,
				p256dh: args.p256dh,
				auth: args.auth,
				userAgent: args.userAgent,
				createdAt: Date.now(),
			});
		} else {
			await ctx.db.insert("pushSubscriptions", {
				personId: person._id,
				...args,
				createdAt: Date.now(),
			});
		}
		await trimToCap(ctx, person._id);
		return null;
	},
});

/** Forget this device (turning push off, or signing out). Only the caller's own
 *  row: an endpoint is a capability URL, but ownership still gates deletion. */
export const unsubscribe = mutation({
	args: { endpoint: v.string() },
	handler: async (ctx, { endpoint }): Promise<null> => {
		const person = await personForCurrentUser(ctx);
		if (!person) return null;
		const row = await byEndpoint(ctx, endpoint);
		if (row?.personId === person._id) await ctx.db.delete(row._id);
		return null;
	},
});

/** The push service said this endpoint is gone (404/410): drop it. */
export const removeByEndpoint = internalMutation({
	args: { endpoint: v.string() },
	handler: async (ctx, { endpoint }): Promise<null> => {
		const row = await byEndpoint(ctx, endpoint);
		if (row) await ctx.db.delete(row._id);
		return null;
	},
});
