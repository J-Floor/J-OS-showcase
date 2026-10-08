import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "./_generated/server";

const SAFE_BROWSING_ENDPOINT =
	"https://safebrowsing.googleapis.com/v4/threatMatches:find";
const THREAT_TYPES = [
	"MALWARE",
	"SOCIAL_ENGINEERING",
	"UNWANTED_SOFTWARE",
	"POTENTIALLY_HARMFUL_APPLICATION",
];

/** Queue a Safe Browsing check for a person who has just saved links. */
export async function scheduleLinkCheck(
	ctx: MutationCtx,
	personId: Id<"people">,
	links: { url: string }[] | undefined
): Promise<void> {
	if (links === undefined || links.length === 0) return;
	await ctx.scheduler.runAfter(0, internal.linkSafety.check, { personId });
}

export const links = internalQuery({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) =>
		(await ctx.db.get(personId))?.venture?.links?.map((l) => l.url) ?? [],
});

export const record = internalMutation({
	args: {
		personId: v.id("people"),
		results: v.array(
			v.object({ url: v.string(), threat: v.optional(v.string()) })
		),
		checkedAt: v.number(),
	},
	handler: async (ctx, { personId, results, checkedAt }) => {
		const person = await ctx.db.get(personId);
		const current = person?.venture?.links;
		if (!person || !current) return null;
		const byUrl = new Map(results.map((r) => [r.url, r.threat]));
		const next = current.map((l) =>
			byUrl.has(l.url) ? { ...l, threat: byUrl.get(l.url), checkedAt } : l
		);
		await ctx.db.patch(personId, {
			venture: { ...person.venture, links: next },
		});
		return null;
	},
});

/**
 * Ask Google Safe Browsing about a person's venture links and stamp the
 * verdict on each. No key → skipped. Any API failure → logged, nothing
 * written; the next edit rechecks.
 */
export const check = internalAction({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		const urls = await ctx.runQuery(internal.linkSafety.links, {
			personId,
		});
		if (urls.length === 0) return null;
		const key = process.env.SAFE_BROWSING_API_KEY;
		if (!key) {
			// eslint-disable-next-line no-console -- deployment misconfiguration, surface in the Convex logs
			console.warn(
				"[linkSafety] SAFE_BROWSING_API_KEY not set; links unchecked"
			);
			return null;
		}
		let data: {
			matches?: { threatType?: string; threat?: { url?: unknown } }[];
		};
		try {
			const res = await fetch(SAFE_BROWSING_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": key,
				},
				body: JSON.stringify({
					client: { clientId: "j-os", clientVersion: "1" },
					threatInfo: {
						threatTypes: THREAT_TYPES,
						platformTypes: ["ANY_PLATFORM"],
						threatEntryTypes: ["URL"],
						threatEntries: urls.map((url) => ({ url })),
					},
				}),
			});
			if (!res.ok) {
				// eslint-disable-next-line no-console -- surface API failures in the Convex logs
				console.error(
					`[linkSafety] Safe Browsing returned ${String(res.status)}`
				);
				return null;
			}
			data = (await res.json()) as typeof data;
		} catch (error) {
			// The error message can carry the request URL; log the name only.
			// eslint-disable-next-line no-console -- surface API failures in the Convex logs
			console.error(
				`[linkSafety] Safe Browsing request failed: ${error instanceof Error ? error.name : "unknown"}`
			);
			return null;
		}
		const threats = new Map<string, string>();
		for (const m of data.matches ?? []) {
			const url = m.threat?.url;
			if (typeof url === "string" && typeof m.threatType === "string") {
				threats.set(url, m.threatType);
			}
		}
		await ctx.runMutation(internal.linkSafety.record, {
			personId,
			results: urls.map((url) => ({
				url,
				threat: threats.get(url) ?? threats.get(`${url}/`),
			})),
			checkedAt: Date.now(),
		});
		return null;
	},
});
