// Perk constants and rules shared by the schema (which builds its validators
// from these arrays), the backend and the app. `schema.ts` imports this file,
// so it must never import `schema.ts`, at runtime or through its imports:
// `_generated/dataModel` is a type-only import (erased), and `derive.ts`,
// `roles.ts` and `time.ts` do not reach the schema.
import { err, ok, type Result } from "neverthrow";

import type { Doc } from "../_generated/dataModel";

import { entitled } from "./derive.ts";
import type { PerksError } from "./errors/perks.ts";
import { isBoardLevel } from "./roles.ts";
import {
	SITE_TIMEZONE,
	isoToUtcMidnight,
	utcMidnightToIso,
	zonedDate,
	zonedLocalFromEpoch,
} from "./time.ts";

export const PERK_CATEGORIES = [
	"cloud",
	"software",
	"legal",
	"finance",
	"marketing",
	"hiring",
	"other",
] as const;
export type PerkCategory = (typeof PERK_CATEGORIES)[number];

export const PERK_CATEGORY_LABELS: Record<PerkCategory, string> = {
	cloud: "Cloud",
	software: "Software",
	legal: "Legal",
	finance: "Finance",
	marketing: "Marketing",
	hiring: "Hiring",
	other: "Other",
};

/** `requested` → `contacted` → `granted` | `declined`. Only the board sees a
 *  request's status. */
export const PERK_REQUEST_STATUSES = [
	"requested",
	"contacted",
	"granted",
	"declined",
] as const;
export type PerkRequestStatus = (typeof PERK_REQUEST_STATUSES)[number];

export const PERK_REQUEST_STATUS_LABELS: Record<PerkRequestStatus, string> = {
	requested: "Requested",
	contacted: "Contacted",
	granted: "Granted",
	declined: "Declined",
};

/** The statuses the board has not closed yet. While a person has a request
 *  for a perk in one of them, they cannot request that perk again. */
export const OPEN_REQUEST_STATUSES: readonly PerkRequestStatus[] = [
	"requested",
	"contacted",
];

export function isOpenRequest(status: PerkRequestStatus): boolean {
	return OPEN_REQUEST_STATUSES.includes(status);
}

/** Bounds on one response, far above J floor's volume, as `events.ts` caps an
 *  attendee roster. The full list feeds the Requests tab's summary and CSV,
 *  so it gets the larger cap. */
export const PERK_REQUEST_LIST_CAP = 2000;
export const PERK_REQUESTS_PER_PERK_CAP = 500;

/** Today at the site, `YYYY-MM-DD` in Zurich: what `validUntil` is compared
 *  with, whatever zone the server runs in. */
export function siteToday(now: number): string {
	return zonedDate(zonedLocalFromEpoch(now, SITE_TIMEZONE));
}

/** `validUntil` is inclusive: a perk stays valid through that whole Zurich
 *  day and is expired from the next. A perk with no end date never expires.
 *  Both sides are `YYYY-MM-DD`, so string order is date order. */
export function isPerkExpired(
	validUntil: string | undefined,
	now: number
): boolean {
	return validUntil !== undefined && validUntil < siteToday(now);
}

/** `value` when it is a real calendar date written `YYYY-MM-DD`. Only such a
 *  date survives the UTC-midnight round trip unchanged: a loose form
 *  ("2026-2-3") comes back rewritten, and an impossible day ("2026-02-30")
 *  rolls over or does not parse. */
export function parsePerkDate(value: string): Result<string, PerksError> {
	return utcMidnightToIso(isoToUtcMidnight(value)) === value
		? ok(value)
		: err({ type: "PerkDateInvalid" });
}

/**
 * Whether `person` can act as a perk's contact: they exist, are board-level
 * and are entitled right now (`lib/derive#entitled`: an access tier, a live
 * stage and an open window, before any door override), the same test
 * `notify/audience#boardIds` applies to the whole board. The contact check
 * on `createPerk`/`updatePerk` and the `perkRequested` audience both ask
 * this, so the two cannot drift apart.
 */
export function isActiveContact(
	person: Doc<"people"> | null,
	now: number
): person is Doc<"people"> {
	return (
		person !== null && isBoardLevel(person.tier) && entitled(person, now)
	);
}
