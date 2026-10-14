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
	context: MutationCtx,
	personId: Id<"people">,
	links: { url: string }[] | undefined
): Promise<void> {
	if (links === undefined || links.length === 0) return;
	await context.scheduler.runAfter(0, internal.linkSafety.check, {
		personId,
	});
}

export const links = internalQuery({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		const person = await context.db.get(personId);
		return person?.venture?.links?.map((link) => link.url) ?? [];
	},
});

export const record = internalMutation({
	args: {
		personId: v.id("people"),
		results: v.array(
			v.object({ url: v.string(), threat: v.optional(v.string()) })
		),
		checkedAt: v.number(),
	},
	handler: async (context, { personId, results, checkedAt }) => {
		const person = await context.db.get(personId);
		const current = person?.venture?.links;
		if (!person || !current) return;
		const byUrl = new Map(
			results.map((result) => [result.url, result.threat])
		);
		const next = current.map((link) =>
			byUrl.has(link.url)
				? { ...link, threat: byUrl.get(link.url), checkedAt }
				: link
		);
		await context.db.patch(personId, {
			venture: { ...person.venture, links: next },
		});
	},
});

type SafeBrowsingResponse = {
	matches?: { threatType?: string; threat?: { url?: unknown } }[];
};

/** The API's answer for these URLs, or null when the request failed (logged). */
async function fetchThreatMatches(
	urls: string[],
	key: string
): Promise<SafeBrowsingResponse | null> {
	try {
		const response = await fetch(SAFE_BROWSING_ENDPOINT, {
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
		if (!response.ok) {
			// eslint-disable-next-line no-console -- surface API failures in the Convex logs
			console.error(
				`[linkSafety] Safe Browsing returned ${String(response.status)}`
			);
			return null;
		}
		return (await response.json()) as SafeBrowsingResponse;
	} catch (error) {
		// The error message can carry the request URL; log the name only.
		// eslint-disable-next-line no-console -- surface API failures in the Convex logs
		console.error(
			`[linkSafety] Safe Browsing request failed: ${error instanceof Error ? error.name : "unknown"}`
		);
		return null;
	}
}

function threatsByUrl(data: SafeBrowsingResponse): Map<string, string> {
	const threats = new Map<string, string>();
	const matches = data.matches ?? [];
	for (const match of matches) {
		const url = match.threat?.url;
		if (typeof url === "string" && typeof match.threatType === "string") {
			threats.set(url, match.threatType);
		}
	}
	return threats;
}

/**
 * Ask Google Safe Browsing about a person's venture links and stamp the
 * verdict on each. No key → skipped. Any API failure → logged, nothing
 * written; the next edit rechecks.
 */
export const check = internalAction({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		const urls = await context.runQuery(internal.linkSafety.links, {
			personId,
		});
		if (urls.length === 0) return;
		const key = process.env.SAFE_BROWSING_API_KEY;
		if (!key) {
			// eslint-disable-next-line no-console -- deployment misconfiguration, surface in the Convex logs
			console.warn(
				"[linkSafety] SAFE_BROWSING_API_KEY not set; links unchecked"
			);
			return;
		}
		const data = await fetchThreatMatches(urls, key);
		if (data === null) return;
		const threats = threatsByUrl(data);
		await context.runMutation(internal.linkSafety.record, {
			personId,
			results: urls.map((url) => ({
				url,
				threat: threats.get(url) ?? threats.get(`${url}/`),
			})),
			checkedAt: Date.now(),
		});
	},
});
