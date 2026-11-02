import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	mutation,
	query,
	type QueryCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import type { InputError } from "./lib/errors/input.ts";
import type { PerksError } from "./lib/errors/perks.ts";
import { displayName } from "./lib/names.ts";
import {
	activeContactOf,
	isActiveContact,
	isPerkExpired,
	parsePerkDate,
} from "./lib/perks.ts";
import { readOnce, type Readers } from "./lib/readOnce.ts";
import { refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { normalizeHttpUrl } from "./lib/safeUrl.ts";
import {
	checkLength,
	clearableText,
	NAME_MAX,
	TEXT_MAX,
} from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { perkCategory } from "./schema.ts";

// The perk catalog: the deals the board has negotiated with partners.
// Requests against a perk live in perkRequests.ts.

// As in events.ts: a perk's request history can outgrow one transaction's
// read/write limits, so deleting a perk purges it in bounded,
// self-rescheduling batches.
const BATCH_SIZE = 200;

/** A perk as the page lists it, with its contact's names joined in. Both are
 *  absent when the perk has no contact, or its contact's row is gone or
 *  can no longer act as one (`isActiveContact`). */
export type PerkRow = Doc<"perks"> & {
	contactName?: string;
	contactFirstName?: string;
};

/** The fields a board member types, as they are stored. */
type PerkText = {
	partner: string;
	title: string;
	terms: string;
	link?: string;
	validUntil?: string;
};

/** The same fields as an update sends them: absent keeps, null clears. */
type PerkTextUpdate = {
	partner?: string;
	title?: string;
	terms?: string;
	link?: string | null;
	validUntil?: string | null;
};

/** A link as it is stored: none when blank, else the normalised http(s)
 *  address. Members open it from the sheet, so `javascript:`, `data:` and
 *  the like are refused. */
function cleanLink(
	link: string | undefined
): Result<string | undefined, PerksError> {
	if (link === undefined || link.trim() === "") return ok(undefined);
	const normalized = normalizeHttpUrl(link);
	return normalized === null
		? err({ type: "PerkLinkInvalid" })
		: ok(normalized);
}

/** An end date as it is stored: none when absent, else a real calendar day. */
function cleanValidUntil(
	validUntil: string | undefined
): Result<string | undefined, PerksError> {
	return validUntil === undefined ? ok(undefined) : parsePerkDate(validUntil);
}

/** The typed fields as they must be stored: trimmed, the required ones
 *  present, each within its cap. */
function cleanPerkText(
	fields: PerkText
): Result<PerkText, PerksError | InputError> {
	const partner = fields.partner.trim();
	const title = fields.title.trim();
	const terms = fields.terms.trim();
	if ([partner, title, terms].includes(""))
		return err({ type: "PerkFieldRequired" });
	return checkLength(partner, NAME_MAX)
		.andThen(() => checkLength(title, NAME_MAX))
		.andThen(() => checkLength(terms, TEXT_MAX))
		.andThen(() => checkLength(fields.link, TEXT_MAX))
		.andThen(() => cleanLink(fields.link))
		.andThen((link) =>
			cleanValidUntil(fields.validUntil).map((validUntil) => ({
				partner,
				title,
				terms,
				link,
				validUntil,
			}))
		);
}

/** An optional field after an update: absent keeps what is stored, null
 *  clears it (the rule `withNullsCleared` applies to a raw patch). */
function updatedOptional(
	supplied: string | null | undefined,
	stored: string | undefined
): string | undefined {
	return supplied === undefined ? stored : (supplied ?? undefined);
}

/** The typed fields once an update is merged over the stored perk. */
function mergedText(existing: Doc<"perks">, update: PerkTextUpdate): PerkText {
	return {
		partner: update.partner ?? existing.partner,
		title: update.title ?? existing.title,
		terms: update.terms ?? existing.terms,
		link: updatedOptional(update.link, existing.link),
		validUntil: updatedOptional(update.validUntil, existing.validUntil),
	};
}

/** The contact is told about every request for the perk, so they must be
 *  able to act on one now. The rule is `isActiveContact`, which the
 *  `perkRequested` audience uses too; this only names the refusal. */
async function checkContact(
	context: QueryCtx,
	contactId: Id<"people">
): Promise<Result<void, PerksError>> {
	return isActiveContact(await context.db.get(contactId), Date.now())
		? ok()
		: err({ type: "PerkContactNotBoard" });
}

/**
 * The perk with its contact's names joined in, while `isActiveContact` says
 * they can act as one: a contact who was erased, demoted or whose window
 * closed is no contact, as the `perkRequested` audience has it, so members
 * see "No contact" and the board is asked to pick one.
 */
async function withContactNames(
	readers: Readers,
	perk: Doc<"perks">,
	now: number
): Promise<PerkRow> {
	const contact = await activeContactOf(readers, perk.contactId, now);
	if (contact === undefined) return perk;
	return {
		...perk,
		contactName: displayName(contact),
		// The member's "Request sent" toast greets the contact by it.
		contactFirstName: contact.firstName,
	};
}

/** Names compare by English rules on every server, whatever its default
 *  locale, and both keys by the same ones. */
const SORT_LOCALE = "en";
const SORT_OPTIONS: Intl.CollatorOptions = { sensitivity: "variant" };

/** Partner A to Z, then each partner's perks by title. */
function byPartnerThenTitle(first: PerkRow, second: PerkRow): number {
	return (
		first.partner.localeCompare(
			second.partner,
			SORT_LOCALE,
			SORT_OPTIONS
		) || first.title.localeCompare(second.title, SORT_LOCALE, SORT_OPTIONS)
	);
}

export const listPerks = query({
	args: {},
	handler: async (context): Promise<PerkRow[]> => {
		// Every community tier browses perks and may request one. Staff get
		// the door and the board contacts only, as with Events.
		unwrap(await requireRole(context, COMMUNITY_TIERS));
		// The board curates a handful of perks, and the page lists them all.
		const perks = await context.db.query("perks").collect();
		// Each contact is read once, however many perks name them.
		const readers = readOnce(context);
		const now = Date.now();
		const rows = await Promise.all(
			perks.map((perk) => withContactNames(readers, perk, now))
		);
		return rows.sort(byPartnerThenTitle);
	},
});

export const createPerk = mutation({
	args: {
		partner: v.string(),
		title: v.string(),
		terms: v.string(),
		category: perkCategory,
		contactId: v.id("people"),
		link: v.optional(v.string()),
		validUntil: v.optional(v.string()),
	},
	handler: async (
		context,
		{ category, contactId, ...typed }
	): Promise<Id<"perks">> => {
		const person = unwrap(await requireRole(context, BOARD_LEVEL));
		const text = unwrap(cleanPerkText(typed));
		unwrap(await checkContact(context, contactId));
		const now = Date.now();
		const perkId = await context.db.insert("perks", {
			...text,
			category,
			contactId,
			createdBy: person._id,
			createdAt: now,
		});
		// A perk entered after its last day is a record, not news.
		if (!isPerkExpired(text.validUntil, now)) {
			await notify(context, "perkAdded", {
				perkId,
				partner: text.partner,
				perkTitle: text.title,
				addedBy: person._id,
			});
		}
		return perkId;
	},
});

export const updatePerk = mutation({
	args: {
		perkId: v.id("perks"),
		partner: v.optional(v.string()),
		title: v.optional(v.string()),
		terms: v.optional(v.string()),
		category: v.optional(perkCategory),
		contactId: v.optional(v.id("people")),
		link: clearableText,
		validUntil: clearableText,
	},
	handler: async (
		context,
		{ perkId, category, contactId, ...update }
	): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const existing = await context.db.get(perkId);
		if (!existing) return refuse({ type: "PerkNotFound" });
		// Only a newly chosen contact is checked: an edit to the terms must
		// still save after the current contact has stepped down.
		if (contactId !== undefined)
			unwrap(await checkContact(context, contactId));
		// Each sheet field autosaves on its own, so merge the supplied field(s)
		// over the row and validate the RESULT: a lone edit must not blank a
		// required field. A cleared link or end date patches as undefined,
		// which removes it.
		const text = unwrap(cleanPerkText(mergedText(existing, update)));
		await context.db.patch(perkId, {
			...text,
			category: category ?? existing.category,
			contactId: contactId ?? existing.contactId,
		});
		return null;
	},
});

export const deletePerk = mutation({
	args: { perkId: v.id("perks") },
	handler: async (context, { perkId }): Promise<null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		// A second click or tab finds it gone and does nothing: the first
		// delete already queued the purge.
		const perk = await context.db.get(perkId);
		if (perk) {
			// The perk goes first, so it leaves listPerks at once and a
			// request for it is refused. Its requests follow in bounded
			// batches.
			await context.db.delete(perkId);
			await context.scheduler.runAfter(
				0,
				internal.perks.purgePerkRequests,
				{ perkId }
			);
		}
		return null;
	},
});

/**
 * Bounded batch delete of one perk's requests over the
 * `by_perkId_and_requestedAt` index. Reschedules itself while a batch comes
 * back full. It converges because deleting shrinks the range it reads, as in
 * `purgeEventAttendance`.
 */
export const purgePerkRequests = internalMutation({
	args: { perkId: v.id("perks") },
	handler: async (context, { perkId }): Promise<null> => {
		const rows = await context.db
			.query("perkRequests")
			.withIndex("by_perkId_and_requestedAt", (range) =>
				range.eq("perkId", perkId)
			)
			.take(BATCH_SIZE);
		for (const row of rows) await context.db.delete(row._id);
		if (rows.length === BATCH_SIZE) {
			await context.scheduler.runAfter(
				0,
				internal.perks.purgePerkRequests,
				{ perkId }
			);
		}
		return null;
	},
});
