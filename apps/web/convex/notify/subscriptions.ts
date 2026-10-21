import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation, mutation } from "../_generated/server";
import { requireRole } from "../lib/authGuard.ts";
import { personForCurrentUser } from "../lib/currentPerson.ts";
import type { NotifyError } from "../lib/errors/notify.ts";
import { unwrap } from "../lib/result.ts";
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
function checkSubscription(args: {
	endpoint: string;
	p256dh: string;
	auth: string;
}): Result<void, NotifyError> {
	const { endpoint, p256dh, auth } = args;
	if (
		endpoint.length > MAX_ENDPOINT_LENGTH ||
		p256dh.length > MAX_P256DH_LENGTH ||
		auth.length > MAX_AUTH_LENGTH
	)
		return err({ type: "InvalidPushEndpoint" });
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return err({ type: "InvalidPushEndpoint" });
	}
	return url.protocol === "https:" && isAllowedHost(url.hostname)
		? ok()
		: err({ type: "InvalidPushEndpoint" });
}

async function trimToCap(context: MutationCtx, personId: Id<"people">) {
	const rows = await context.db
		.query("pushSubscriptions")
		.withIndex("by_person", (range) => range.eq("personId", personId))
		.collect();
	const excess = rows.length - MAX_SUBSCRIPTIONS_PER_PERSON;
	if (excess <= 0) return;
	const oldest = [...rows]
		// eslint-disable-next-line id-length -- conventional comparator parameter names
		.sort((a, b) => a.createdAt - b.createdAt)
		.slice(0, excess);
	for (const row of oldest) await context.db.delete(row._id);
}

async function byEndpoint(context: MutationCtx, endpoint: string) {
	return context.db
		.query("pushSubscriptions")
		.withIndex("by_endpoint", (range) => range.eq("endpoint", endpoint))
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
	handler: async (context, args): Promise<null> => {
		const person = unwrap(await requireRole(context, COMMUNITY_TIERS));
		unwrap(checkSubscription(args));
		const existing = await byEndpoint(context, args.endpoint);
		if (existing) {
			await context.db.patch(existing._id, {
				personId: person._id,
				p256dh: args.p256dh,
				auth: args.auth,
				userAgent: args.userAgent,
				createdAt: Date.now(),
			});
		} else {
			await context.db.insert("pushSubscriptions", {
				personId: person._id,
				...args,
				createdAt: Date.now(),
			});
		}
		await trimToCap(context, person._id);
		return null;
	},
});

/** Forget this device (turning push off, or signing out). Only the caller's own
 *  row: an endpoint is a capability URL, but ownership still gates deletion. */
export const unsubscribe = mutation({
	args: { endpoint: v.string() },
	handler: async (context, { endpoint }): Promise<void> => {
		const person = await personForCurrentUser(context);
		if (!person) return;
		const row = await byEndpoint(context, endpoint);
		if (row?.personId === person._id) await context.db.delete(row._id);
	},
});

/** The push service said this endpoint is gone (404/410): drop it. */
export const removeByEndpoint = internalMutation({
	args: { endpoint: v.string() },
	handler: async (context, { endpoint }): Promise<null> => {
		const row = await byEndpoint(context, endpoint);
		if (row) await context.db.delete(row._id);
		return null;
	},
});
