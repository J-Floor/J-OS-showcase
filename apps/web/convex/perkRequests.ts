import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { displayName, nameOf } from "./lib/names.ts";
import {
	activeContactOf,
	isAnswer,
	isOpenRequest,
	isPerkExpired,
	PERK_REQUEST_LIST_CAP,
	PERK_REQUESTS_PER_PERK_CAP,
	type PerkRequestStatus,
} from "./lib/perks.ts";
import { readOnce, type Readers } from "./lib/readOnce.ts";
import { refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { optionalCappedText, TEXT_MAX } from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { perkRequestStatus } from "./schema.ts";

/** A request as the board tracks it, with every name it shows joined in. */
export type PerkRequestRow = {
	_id: Id<"perkRequests">;
	perkId: Id<"perks">;
	personId: Id<"people">;
	requesterName: string;
	requesterEmail: string;
	ventureName?: string;
	perkTitle: string;
	partner: string;
	/** Absent when the perk has no contact, or its contact's row is gone or
	 *  can no longer act as one (`isActiveContact`), as on `listPerks`. */
	contactName?: string;
	requestedAt: number;
	note?: string;
	status: PerkRequestStatus;
	statusAt: number;
	statusByName?: string;
};

/** A member's own open request. No status: where it stands is the board's
 *  business. */
export type MyOpenPerkRequest = {
	perkId: Id<"perks">;
	requestedAt: number;
	note?: string;
};

/** The perk's contact's display name while `isActiveContact` says they can
 *  act as one: the rule `listPerks` joins by, so the board's lists and the
 *  sheet agree on who the contact is. */
async function contactNameOf(
	readers: Readers,
	perk: Doc<"perks">,
	now: number
): Promise<string | undefined> {
	const contact = await activeContactOf(readers, perk.contactId, now);
	return contact === undefined ? undefined : displayName(contact);
}

/** Null once the perk or the requester is gone: the board has nothing left
 *  to act on, and the perk purge or the erasure deletes the row soon after. */
async function joinRequest(
	readers: Readers,
	request: Doc<"perkRequests">,
	now: number
): Promise<PerkRequestRow | null> {
	const [requester, perk] = await Promise.all([
		readers.person(request.personId),
		readers.perk(request.perkId),
	]);
	if (!requester || !perk) return null;
	const [contactName, statusByName] = await Promise.all([
		contactNameOf(readers, perk, now),
		nameOf(readers, request.statusById),
	]);
	return {
		_id: request._id,
		perkId: request.perkId,
		personId: request.personId,
		requesterName: displayName(requester),
		requesterEmail: requester.email,
		ventureName: requester.venture?.name,
		perkTitle: perk.title,
		partner: perk.partner,
		contactName,
		requestedAt: request.requestedAt,
		note: request.note,
		status: request.status,
		statusAt: request.statusAt,
		statusByName,
	};
}

async function joinRequests(
	context: QueryCtx,
	requests: readonly Doc<"perkRequests">[]
): Promise<PerkRequestRow[]> {
	const readers = readOnce(context);
	// One instant for the whole run: every row judges its contact alike.
	const now = Date.now();
	const rows = await Promise.all(
		requests.map((request) => joinRequest(readers, request, now))
	);
	return rows.filter((row): row is PerkRequestRow => row !== null);
}

/** The person's open request for this perk, if any. Newest first, since an
 *  open request is normally the latest. Capped like a perk's own request
 *  list, which one person's history with that perk never comes near. */
async function openRequestFor(
	context: QueryCtx,
	personId: Id<"people">,
	perkId: Id<"perks">
): Promise<Doc<"perkRequests"> | undefined> {
	const requests = await context.db
		.query("perkRequests")
		.withIndex("by_personId_and_perkId", (range) =>
			range.eq("personId", personId).eq("perkId", perkId)
		)
		.order("desc")
		.take(PERK_REQUESTS_PER_PERK_CAP);
	return requests.find((request) => isOpenRequest(request.status));
}

/**
 * A member asks for a perk, and its contact hears about it through the
 * notification system. One open request per person per perk: asking again
 * while one is open returns that one, so a double click or a second tab makes
 * one row and one notification. The check runs before the expiry and note
 * checks, so a member whose request is already open gets it back, never an
 * expiry or note refusal.
 */
export const requestPerk = mutation({
	args: { perkId: v.id("perks"), note: v.optional(v.string()) },
	handler: async (context, { perkId, note }): Promise<Id<"perkRequests">> => {
		const person = unwrap(await requireRole(context, COMMUNITY_TIERS));
		const perk = await context.db.get(perkId);
		if (!perk) return refuse({ type: "PerkNotFound" });
		const openRequest = await openRequestFor(context, person._id, perkId);
		if (openRequest) return openRequest._id;
		const now = Date.now();
		if (isPerkExpired(perk.validUntil, now))
			return refuse({ type: "PerkExpired" });
		const storedNote = unwrap(optionalCappedText(note, TEXT_MAX));
		const requestId = await context.db.insert("perkRequests", {
			perkId,
			personId: person._id,
			requestedAt: now,
			note: storedNote,
			status: "requested",
			statusAt: now,
		});
		await notify(context, "perkRequested", {
			requestId,
			perkId,
			contactId: perk.contactId,
			perkTitle: perk.title,
			partner: perk.partner,
			requesterName: displayName(person),
			requesterEmail: person.email,
			ventureName: person.venture?.name,
			note: storedNote,
		});
		return requestId;
	},
});

/** The caller's open requests: what the sheet shows as "Requested on". */
export const myOpenPerkRequests = query({
	args: {},
	handler: async (context): Promise<MyOpenPerkRequest[]> => {
		const person = unwrap(await requireRole(context, COMMUNITY_TIERS));
		// One person's requests, capped like the board's list they belong to.
		const requests = await context.db
			.query("perkRequests")
			.withIndex("by_personId_and_perkId", (range) =>
				range.eq("personId", person._id)
			)
			.take(PERK_REQUEST_LIST_CAP);
		return requests
			.filter((request) => isOpenRequest(request.status))
			.map(({ perkId, requestedAt, note }) => ({
				perkId,
				requestedAt,
				note,
			}));
	},
});

/** The board's request list: the joined rows, and whether the read stopped
 *  at the cap, so older requests exist that it does not hold. */
type PerkRequestList = {
	requests: PerkRequestRow[];
	capped: boolean;
};

/**
 * Every request the board tracks, newest first, with names joined in. Only
 * the newest PERK_REQUEST_LIST_CAP: that is the history the Requests tab
 * groups and exports. It stays one live query, not the door log's floored
 * pages, so a status change on an old request still shows. `capped` counts
 * the rows read, before the join drops any whose perk or requester is gone.
 */
export const listPerkRequests = query({
	args: {},
	handler: async (context): Promise<PerkRequestList> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const requests = await context.db
			.query("perkRequests")
			.withIndex("by_requestedAt")
			.order("desc")
			.take(PERK_REQUEST_LIST_CAP);
		return {
			requests: await joinRequests(context, requests),
			capped: requests.length === PERK_REQUEST_LIST_CAP,
		};
	},
});

/** One perk's requests for its sheet, newest first. Capped like the event
 *  roster: far above real volume, and it bounds one response. */
export const listRequestsForPerk = query({
	args: { perkId: v.id("perks") },
	handler: async (context, { perkId }): Promise<PerkRequestRow[]> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const requests = await context.db
			.query("perkRequests")
			.withIndex("by_perkId_and_requestedAt", (range) =>
				range.eq("perkId", perkId)
			)
			.order("desc")
			.take(PERK_REQUESTS_PER_PERK_CAP);
		return joinRequests(context, requests);
	},
});

/** Any board member moves a request to any status. The stamp records who
 *  moved it and when. Landing on an answer (Granted or Declined) that differs
 *  from the request's status tells the requester; nothing else does. */
export const setPerkRequestStatus = mutation({
	args: { requestId: v.id("perkRequests"), status: perkRequestStatus },
	handler: async (context, { requestId, status }): Promise<null> => {
		const caller = unwrap(await requireRole(context, BOARD_LEVEL));
		const request = await context.db.get(requestId);
		if (!request) return refuse({ type: "PerkRequestNotFound" });
		await context.db.patch(requestId, {
			status,
			statusAt: Date.now(),
			statusById: caller._id,
		});
		const perk = await context.db.get(request.perkId);
		if (perk && isAnswer(status) && status !== request.status) {
			await notify(context, "perkRequestOutcome", {
				requestId,
				perkId: perk._id,
				personId: request.personId,
				partner: perk.partner,
				perkTitle: perk.title,
				outcome: status,
			});
		}
		return null;
	},
});
