import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
} from "../_generated/server";
import {
	dailyDigest,
	type DailyDigestProps,
} from "../emails/generated/dailyDigest.ts";
import { emailUrls, manageNotificationsUrl } from "../emails/urls.ts";
import { DAY_MS } from "../lib/constants.ts";
import { entitled } from "../lib/derive.ts";
import { sendEmail } from "../lib/email.ts";
import { COMMUNITY_TIERS, isBoardLevel } from "../lib/roles.ts";
import { peopleByTiers } from "../people.ts";

import { CATEGORY_INFO, prefFor } from "./categories.ts";
import { isDigestKind, kindDefinition } from "./registry.ts";

const DIGEST_ROW_CAP = 50;
const DIGEST_SCAN_CAP = 200;
const MAX_CONSECUTIVE_FAILURES = 3;

type DigestItem = DailyDigestProps["items"][number];
type Collected = {
	email: string;
	items: DigestItem[];
	/** Where the cursor moves once these items are handled. */
	advanceTo: number | null;
	/** The point this collection started from. */
	since: number;
	/** Whether the person already has a stored cursor. */
	hasCursor: boolean;
};

/** Community people: board level first, then everyone else by cursor, oldest
 *  first (no cursor first), so a quota that runs out mid-run holds back
 *  different people each day. Staff are not community. People whose access
 *  ended stay in, so their cursor moves on without an email. */
export const audience = internalQuery({
	args: {},
	handler: async (context): Promise<Id<"people">[]> => {
		const people = await peopleByTiers(context, COMMUNITY_TIERS);
		const board = people.filter((person) => isBoardLevel(person.tier));
		const rest = people
			.filter((person) => !isBoardLevel(person.tier))
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => (a.digestCursor ?? 0) - (b.digestCursor ?? 0));
		return [...board, ...rest].map((person) => person._id);
	},
});

/** One person's digest: their own unread digest-kind rows past the cursor,
 *  in categories they still want by email. */
export const collect = internalQuery({
	args: { personId: v.id("people") },
	handler: async (context, { personId }): Promise<Collected | null> => {
		const person = await context.db.get(personId);
		if (!person) return null;
		const now = Date.now();
		const since = person.digestCursor ?? now - DAY_MS;
		const rows = await context.db
			.query("notifications")
			.withIndex("by_personId_and_createdAt", (range) =>
				range.eq("personId", personId).gt("createdAt", since)
			)
			.order("asc")
			.take(DIGEST_SCAN_CAP);
		const isEntitled = entitled(person, now);
		const items: DigestItem[] = [];
		let advanceTo: number | null = null;
		for (const row of rows) {
			// Rows sharing the last included time come along: the cursor is
			// strict, so they could not be picked up next run.
			if (items.length >= DIGEST_ROW_CAP && row.createdAt !== advanceTo)
				break;
			advanceTo = row.createdAt;
			if (
				!isEntitled ||
				!isDigestKind(row.kind) ||
				row.readAt !== undefined
			)
				continue;
			const category = kindDefinition(row.kind).category;
			if (!prefFor(person.notificationPrefs, category).email) continue;
			items.push({
				section: CATEGORY_INFO[category].label,
				title: row.title,
				body: row.body,
				url: `${emailUrls().siteUrl}${row.url}`,
			});
		}
		return {
			email: person.email,
			items,
			advanceTo,
			since,
			hasCursor: person.digestCursor !== undefined,
		};
	},
});

/** Move a person's cursor forward (never back). */
export const advance = internalMutation({
	args: { personId: v.id("people"), to: v.number() },
	handler: async (context, { personId, to }): Promise<null> => {
		const person = await context.db.get(personId);
		if (person && (person.digestCursor ?? 0) < to) {
			await context.db.patch(personId, { digestCursor: to });
		}
		return null;
	},
});

// dry-ignore -- a pluralised notification heading, unrelated to the board roster subtitle that shares its ternary shape
function digestHeading(count: number): string {
	return count === 1
		? "1 new notification"
		: `${String(count)} new notifications`;
}

function moveCursor(
	context: ActionCtx,
	personId: Id<"people">,
	to: number
): Promise<null> {
	return context.runMutation(internal.notify.digest.advance, {
		personId,
		to,
	});
}

/** One person's digest: collect, send, move the cursor. "held" when the
 *  quota or the provider refused it, "none" when there was nothing to send. */
async function sendOne(
	context: ActionCtx,
	personId: Id<"people">
): Promise<"sent" | "held" | "none"> {
	const digest: Collected | null = await context.runQuery(
		internal.notify.digest.collect,
		{ personId }
	);
	if (!digest) return "none";
	// A person with no cursor gets the window start saved first, so the
	// lookback never drifts while a send is held or nothing is to be sent.
	if (!digest.hasCursor) await moveCursor(context, personId, digest.since);
	const { advanceTo } = digest;
	if (advanceTo === null || digest.items.length === 0) {
		if (advanceTo !== null) await moveCursor(context, personId, advanceTo);
		return "none";
	}
	const urls = emailUrls();
	const count = digest.items.length;
	const heading = digestHeading(count);
	const { html, text } = dailyDigest({
		heading,
		items: digest.items,
		appUrl: urls.siteUrl,
		manageUrl: manageNotificationsUrl(),
		logoUrl: urls.logoUrl,
	});
	const isSent = await sendEmail(context, {
		to: digest.email,
		subject: `J floor: ${heading}`,
		html,
		text,
		priority: "digest",
		devLog: `[digest] ${digest.email}: ${String(count)} items`,
	});
	if (!isSent) return "held";
	await moveCursor(context, personId, advanceTo);
	return "sent";
}

/** The daily digest: one email per person with something new. A send the
 *  quota refuses, or the provider rejects, leaves the cursor so the items
 *  come in the next digest. */
export const send = internalAction({
	args: {},
	handler: async (context): Promise<null> => {
		const ids: Id<"people">[] = await context.runQuery(
			internal.notify.digest.audience,
			{}
		);
		let sent = 0;
		let held = 0;
		let failures = 0;
		for (const personId of ids) {
			try {
				const outcome = await sendOne(context, personId);
				failures = 0;
				if (outcome === "sent") sent += 1;
				else if (outcome === "held") held += 1;
			} catch (error) {
				held += 1;
				failures += 1;
				// eslint-disable-next-line no-console -- one failed person never stops the run; class only, no address or content
				console.error(
					`[digest] one person failed: ${error instanceof Error ? error.name : "unknown"}`
				);
				if (failures >= MAX_CONSECUTIVE_FAILURES) {
					// eslint-disable-next-line no-console -- counts only
					console.error(
						`[digest] stopped after ${String(failures)} failures in a row`
					);
					break;
				}
			}
		}
		// eslint-disable-next-line no-console -- one summary line per run, counts only
		console.log(`[digest] sent ${String(sent)}, held ${String(held)}`);
		return null;
	},
});
