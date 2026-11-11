import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "./_generated/server";
import { authUsersPage } from "./lib/authRecords.ts";
import { normalizeEmail } from "./lib/emailAddress.ts";
import {
	duplicateEmails,
	violations,
	type ViolationCode,
} from "./lib/invariants.ts";
import { displayName } from "./lib/names.ts";
import { applyEventIfLegal } from "./lifecycle.ts";
import { alertOnChange } from "./notify/alertOnChange.ts";
import { LIFECYCLE_ALERT_KEY, type AlertDecision } from "./opsAlerts.ts";

type Found = {
	personId: Id<"people">;
	name: string;
	code: ViolationCode;
	detail: string;
};

/** Sort key and alert fingerprint both: the fingerprint is stable only because
 *  the list is sorted by the same key. */
function keyOf(found: Found): string {
	return `${found.code}:${found.personId}`;
}

type SignatureRow = Doc<"signatures">;

function variantsOf(signatures: SignatureRow[], id: Id<"people">) {
	return signatures
		.filter((signature) => signature.personId === id)
		.map((signature) => signature.variant);
}

/** Activates everyone the machine can activate on its own; returns how many. */
async function healActivatable(
	context: MutationCtx,
	signatures: SignatureRow[],
	now: number
): Promise<number> {
	let healed = 0;
	const people = await context.db.query("people").collect();
	for (const person of people) {
		const codes = violations(
			person,
			variantsOf(signatures, person._id),
			now
		).map((violation) => violation.code);
		// Someone whose window already closed must not be activated by healing.
		if (
			!codes.includes("should-be-active") ||
			codes.includes("live-past-window")
		)
			continue;
		const next = await applyEventIfLegal(context, person._id, {
			type: "ONBOARDING_PROGRESSED",
		});
		if (next !== null) healed += 1;
	}
	return healed;
}

function scanViolations(
	people: Doc<"people">[],
	signatures: SignatureRow[],
	now: number
): Found[] {
	const duplicates = duplicateEmails(people);
	const found: Found[] = [];
	for (const person of people) {
		const list = violations(
			person,
			variantsOf(signatures, person._id),
			now
		);
		const duplicate = duplicates.get(person._id);
		if (duplicate) list.push(duplicate);
		for (const violation of list)
			found.push({
				personId: person._id,
				name: displayName(person),
				code: violation.code,
				detail: violation.detail,
			});
	}
	return found;
}

/**
 * Heal what the machine can heal on its own (someone who should be active),
 * then list every remaining violation. One transaction: the table is small.
 */
export const healAndScan = internalMutation({
	args: {},
	handler: async (context): Promise<{ healed: number; found: Found[] }> => {
		const now = Date.now();
		// eslint-disable-next-line convex/no-collect-in-mutation -- the scan needs every row in one transaction; the space has a few hundred people
		const signatures = await context.db.query("signatures").collect();
		const healed = await healActivatable(context, signatures, now);
		// eslint-disable-next-line convex/no-collect-in-mutation -- duplicate emails pair rows across the whole table; a few hundred people
		const people = await context.db.query("people").collect();
		const found = scanViolations(people, signatures, now);
		found.sort((first, second) =>
			keyOf(first).localeCompare(keyOf(second))
		);
		return { healed, found };
	},
});

const LOGIN_PAGE = 100;

type LinkedPerson = {
	personId: Id<"people">;
	name: string;
	authUserId: string;
	email: string;
};

type Paging = { isDone: boolean; continueCursor: string };
type LoginsPage = Paging & { logins: { _id: string; email: string }[] };
type LinkedPage = Paging & { linked: LinkedPerson[] };

/** One page of logins, for the nightly login check. */
export const loginsPage = internalQuery({
	args: { cursor: v.union(v.string(), v.null()) },
	handler: async (context, { cursor }): Promise<LoginsPage> => {
		const { page, isDone, continueCursor } = await authUsersPage(
			context,
			cursor,
			LOGIN_PAGE
		);
		return {
			logins: page.map((login) => ({
				_id: login._id,
				email: login.email,
			})),
			isDone,
			continueCursor,
		};
	},
});

/** One page of the people linked to a login, for the nightly login check. */
export const linkedPeoplePage = internalQuery({
	args: { cursor: v.union(v.string(), v.null()) },
	handler: async (context, { cursor }): Promise<LinkedPage> => {
		const { page, isDone, continueCursor } = await context.db
			.query("people")
			.paginate({ cursor, numItems: LOGIN_PAGE });
		return {
			linked: page.flatMap((person) =>
				person.authUserId === undefined
					? []
					: [
							{
								personId: person._id,
								name: displayName(person),
								authUserId: person.authUserId,
								email: person.email,
							},
						]
			),
			isDone,
			continueCursor,
		};
	},
});

/** The alert detail names no address: it goes to the board's channel. */
function loginMismatches(
	linked: LinkedPerson[],
	logins: Map<string, string>
): Found[] {
	const found: Found[] = [];
	for (const person of linked) {
		const loginEmail = logins.get(person.authUserId);
		if (
			loginEmail !== undefined &&
			normalizeEmail(loginEmail) === normalizeEmail(person.email)
		)
			continue;
		found.push({
			personId: person.personId,
			name: person.name,
			code: "login-email-mismatch",
			detail:
				loginEmail === undefined
					? "login missing"
					: "login email differs",
		});
	}
	return found;
}

function alertHeadline(outcome: string, count: number): string {
	if (outcome === "resolved")
		return "Every person's status is consistent again";
	return `${count} ${count === 1 ? "person has" : "people have"} an inconsistent status`;
}

/** Nightly: heal, then tell the board about what is left (deduped by opsAlerts). */
export const check = internalAction({
	args: {},
	handler: async (
		context
	): Promise<{
		healed: number;
		violations: number;
		decision: AlertDecision;
	}> => {
		const scan = await context.runMutation(
			internal.invariants.healAndScan,
			{}
		);
		const { healed } = scan;
		const logins = new Map<string, string>();
		let loginCursor: string | null = null;
		for (;;) {
			const page: LoginsPage = await context.runQuery(
				internal.invariants.loginsPage,
				{ cursor: loginCursor }
			);
			for (const login of page.logins) logins.set(login._id, login.email);
			if (page.isDone) break;
			loginCursor = page.continueCursor;
		}
		const linked: LinkedPerson[] = [];
		let peopleCursor: string | null = null;
		for (;;) {
			const page: LinkedPage = await context.runQuery(
				internal.invariants.linkedPeoplePage,
				{ cursor: peopleCursor }
			);
			linked.push(...page.linked);
			if (page.isDone) break;
			peopleCursor = page.continueCursor;
		}
		const found = [...scan.found, ...loginMismatches(linked, logins)].sort(
			(first, second) => keyOf(first).localeCompare(keyOf(second))
		);
		const decision = await alertOnChange(context, {
			key: LIFECYCLE_ALERT_KEY,
			fingerprint: found.map((item) => keyOf(item)).join(","),
			kind: "lifecycleAlert",
			payloadFor: (outcome) => ({
				headline: alertHeadline(outcome, found.length),
				items: outcome === "resolved" ? [] : found,
				tag: LIFECYCLE_ALERT_KEY,
			}),
		});
		return { healed, violations: found.length, decision };
	},
});
