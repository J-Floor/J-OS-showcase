import type { PaginationResult } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import {
	authUsersPage,
	type LinkOutcome,
	linkLogin,
} from "./lib/authRecords.ts";
import { compliance } from "./lib/derive.ts";
import {
	groupByNormalizedEmail,
	normalizeEmail,
	peopleByEmail,
} from "./lib/emailAddress.ts";
import {
	isMembershipActive,
	isStateId,
	onboardingWithoutStep,
	stateOf,
} from "./lib/lifecycle.ts";
import { invariant } from "./lib/result.ts";
import { appendPerkEvent } from "./perkRequests.ts";

/**
 * One-off data fixes, run via `bunx convex run migrations:<name>` (CLI/dashboard
 * only — these are internal). Safe to re-run: each targets an exact bad value so
 * a second run is a no-op.
 */

// The (now-retired) Notion import stamped a hardcoded constant whose YEAR was
// wrong — 2026-12-31 instead of 2025-12-31 — onto two imported fields:
//   • people.accessFrom      → pushed the access-window START into the future,
//     so accessActive() read it as "not active yet" and locked ~55 people out
//     of the whole app.
//   • signatures.signedAt    → same slip; agreement signature dates landed a
//     year in the future.
// These two constants are the same instant, one year apart.
const WRONG = 1798675200000; // 2026-12-31 00:00:00 UTC (the bug)
const CORRECT = 1767139200000; // 2025-12-31 00:00:00 UTC (intended)

/** Read-only: how many rows still carry the wrong 2026-12-31 constant. */
export const previewYearFix = internalQuery({
	args: {},
	handler: async (context) => {
		const people = await context.db.query("people").collect();
		const signatures = await context.db.query("signatures").collect();
		return {
			peopleAffected: people.filter(
				(person) => person.accessFrom === WRONG
			).length,
			signaturesAffected: signatures.filter(
				(signature) => signature.signedAt === WRONG
			).length,
		};
	},
});

/**
 * Rewrite the wrong 2026-12-31 constant to the intended 2025-12-31 on both
 * fields. Only touches rows whose value is EXACTLY the wrong constant, so
 * legitimate dates are untouched and re-runs are no-ops.
 */
export const fixImportYear = internalMutation({
	args: {},
	handler: async (context) => {
		let peoplePatched = 0;
		// eslint-disable-next-line convex/no-collect-in-mutation -- completed one-off over a few hundred people; paginate before re-running on a larger table
		const people = await context.db.query("people").collect();
		for (const person of people) {
			if (person.accessFrom === WRONG) {
				await context.db.patch(person._id, { accessFrom: CORRECT });
				peoplePatched++;
			}
		}
		let signaturesPatched = 0;
		// eslint-disable-next-line convex/no-collect-in-mutation -- completed one-off over a few hundred signatures; paginate before re-running on a larger table
		const signatures = await context.db.query("signatures").collect();
		for (const signature of signatures) {
			if (signature.signedAt === WRONG) {
				await context.db.patch(signature._id, { signedAt: CORRECT });
				signaturesPatched++;
			}
		}
		return { peoplePatched, signaturesPatched };
	},
});

// `people.email` is the person's address, and every `by_email` lookup now
// passes its input through `normalizeEmail`. Rows written before that may still carry
// capitals, and no lookup can find them until they are lowercased. Run once on
// prod right after deploying:
//   bunx convex run migrations:findEmailCollisions --prod   # resolve by hand first
//   bunx convex run migrations:migrateEmailCase --prod
//   bunx convex run migrations:previewEmailCase --prod      # page until empty

const MIGRATION_PAGE_SIZE = 100;

/** One cursor page of `people`; a missing cursor starts at the beginning. */
async function peoplePage(
	context: QueryCtx,
	cursor: string | null | undefined
): Promise<PaginationResult<Doc<"people">>> {
	return await context.db.query("people").paginate({
		cursor: cursor ?? null,
		numItems: MIGRATION_PAGE_SIZE,
	});
}

/**
 * Read-only: the people on this page whose email is not in canonical form.
 * Pass `continueCursor` back as `cursor` until `isDone`.
 */
export const previewEmailCase = internalQuery({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (context, { cursor }) => {
		const page = await peoplePage(context, cursor);
		return {
			nonCanonical: page.page
				.filter(
					(person) => person.email !== normalizeEmail(person.email)
				)
				.map((person) => ({ _id: person._id, email: person.email })),
			isDone: page.isDone,
			continueCursor: page.continueCursor,
		};
	},
});

/**
 * Read-only: groups of people whose emails are equal once normalized. A group
 * here must be resolved by hand (merge or delete) BEFORE `migrateEmailCase`,
 * which skips any row whose canonical email another person already holds.
 * Reads the whole table in one query, like `previewYearFix`: a collision can
 * pair rows from any two pages, `people` is a few hundred rows, and a query
 * carries no write limit.
 */
export const findEmailCollisions = internalQuery({
	args: {},
	handler: async (context) => {
		const groups = groupByNormalizedEmail(
			await context.db.query("people").collect()
		);
		return [...groups].map(([email, people]) => ({
			email,
			people: people.map((person) => ({
				_id: person._id,
				email: person.email,
			})),
		}));
	},
});

/**
 * Lowercase every non-canonical `people.email`, one cursor page per
 * transaction; each page schedules the next, so one CLI call walks the whole
 * table. A row whose canonical email already belongs to another person is
 * left as it is and counted in `collisions`: patching it would put two rows
 * on one `by_email` key and make every `.unique()` lookup on it throw. People
 * are never merged or deleted here. Canonical rows are not touched, so a
 * re-run is a no-op. The counts are per page, so the CLI shows the first
 * page's only; `previewEmailCase` shows what is left.
 */
export const migrateEmailCase = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (context, { cursor }) => {
		const page = await peoplePage(context, cursor);
		let peoplePatched = 0;
		let collisions = 0;
		for (const person of page.page) {
			const email = normalizeEmail(person.email);
			if (email === person.email) continue;
			// `.first()`, not `.unique()`: exact duplicates may already exist,
			// and a throw here would stop the whole scheduled chain.
			const holder = await peopleByEmail(context, email).first();
			if (holder !== null) {
				collisions++;
				continue;
			}
			await context.db.patch(person._id, { email });
			peoplePatched++;
		}
		if (!page.isDone) {
			await context.scheduler.runAfter(
				0,
				internal.migrations.migrateEmailCase,
				{ cursor: page.continueCursor }
			);
		}
		return { peoplePatched, collisions, isDone: page.isDone };
	},
});

/**
 * One-off: stamp `people.activatedAt` for rows that were active before the
 * field existed. Idempotent: rows that already have it are skipped.
 * - membership tier in `active`: `stageSince`.
 * - `former`, or `guest.expired`: the earliest transition into a membership
 *   `*.active` state, if any. A former who left mid-onboarding stays unset.
 */
export const backfillActivatedAt = internalMutation({
	args: {},
	handler: async (context): Promise<{ set: number }> => {
		let set = 0;
		// eslint-disable-next-line convex/no-collect-in-mutation -- completed one-off over a few hundred people; paginate before re-running on a larger table
		const people = await context.db.query("people").collect();
		for (const person of people) {
			if (person.activatedAt !== undefined) continue;
			let at: number | undefined;
			if (isMembershipActive(stateOf(person))) {
				at = person.stageSince;
			} else if (
				person.tier === "former" ||
				(person.tier === "guest" && person.stage === "expired")
			) {
				// eslint-disable-next-line convex/no-collect-in-mutation -- one person's events, in a completed one-off
				const events = await context.db
					.query("personEvents")
					.withIndex("by_personId_and_at", (range) =>
						range.eq("personId", person._id)
					)
					.collect();
				at = events
					// eslint-disable-next-line id-length -- conventional comparator parameter names
					.toSorted((a, b) => a.at - b.at)
					.find(
						(event) =>
							event.kind === "transition" &&
							event.to !== undefined &&
							isStateId(event.to) &&
							isMembershipActive(event.to)
					)?.at;
			}
			if (at === undefined) continue;
			await context.db.patch(person._id, { activatedAt: at });
			set += 1;
		}
		return { set };
	},
});

/**
 * One-off: an active guest with no guest agreement on file (a member
 * agreement does not count) goes back to onboarding with the document step
 * re-opened, so the wizard asks them to sign. Refuses anyone else. Audited as a REPAIR transition.
 */
export const repairGuestWithoutAgreement = internalMutation({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		const person = await context.db.get(personId);
		invariant(
			person?.tier === "guest" && person.stage === "active",
			"Not an active guest."
		);
		// eslint-disable-next-line convex/no-collect-in-mutation -- one person's signatures: a handful of rows
		const sigs = await context.db
			.query("signatures")
			.withIndex("by_person", (range) => range.eq("personId", personId))
			.collect();
		invariant(
			compliance(
				person,
				sigs.map((signature) => signature.variant)
			) !== "met",
			"This guest has a guest agreement."
		);
		const now = Date.now();
		// Written outside applyEvent on purpose: the machine has no active-to-onboarding edge.
		// The document step re-opens too, or a guest who ticked it signing
		// another agreement would have nothing left to sign.
		await context.db.patch(personId, {
			stage: "onboarding",
			stageSince: now,
			onboarding: onboardingWithoutStep(person.onboarding, "document"),
		});
		await context.db.insert("personEvents", {
			personId,
			at: now,
			kind: "transition",
			event: "REPAIR",
			from: "guest.active",
			to: "guest.onboarding",
		});
		return null;
	},
});

/** What a request's row still records of its past: Requested, by the
 *  requester, and its current status, by whoever set it, once it moved. */
function perkStepsOf(
	request: Doc<"perkRequests">
): Parameters<typeof appendPerkEvent>[2][] {
	const requested = {
		event: "requested" as const,
		at: request.requestedAt,
		actorId: request.personId,
	};
	if (request.status === "requested") return [requested];
	return [
		requested,
		{
			event: request.status,
			at: request.statusAt,
			actorId: request.statusById,
		},
	];
}

/** How many of a request's history events the backfill reads to see which
 *  steps are logged: a request moves a handful of times. */
const PERK_EVENTS_READ_PER_REQUEST = 100;

/** The steps of `request` (`perkStepsOf`) its history does not log yet: a
 *  step is logged when an event of its status exists for the request. */
async function missingPerkSteps(
	context: MutationCtx,
	request: Doc<"perkRequests">
): Promise<ReturnType<typeof perkStepsOf>> {
	const logged = await context.db
		.query("personEvents")
		.withIndex("by_perkRequestId_and_at", (range) =>
			range.eq("perkRequestId", request._id)
		)
		.take(PERK_EVENTS_READ_PER_REQUEST);
	const events = new Set(logged.map((row) => row.event));
	return perkStepsOf(request).filter((step) => !events.has(step.event));
}

/** Arguments of a paged migration: where the last page ended, and whether
 *  to only report. */
const PAGED_MIGRATION_ARGS = {
	cursor: v.optional(v.union(v.string(), v.null())),
	dryRun: v.optional(v.boolean()),
};

/**
 * One-off: write the `perk` history events of requests made before those
 * were logged, from what their row still records (`perkStepsOf`). Each step
 * is written only when the request's history lacks an event of that status,
 * so a request moved after the deploy (its move logged, its Requested not)
 * still gets its Requested, and a re-run is a no-op.
 * One cursor page of `perkRequests` per transaction; a real run schedules the
 * next page, so one CLI call walks the table. A dry run writes and schedules
 * nothing and reports one page: pass its `continueCursor` back as `cursor`
 * until `isDone` (Convex allows one paginated query per transaction, so a
 * dry run cannot total every page itself).
 *
 *   bunx convex run migrations:backfillPerkEvents '{"dryRun":true}' --prod
 *   bunx convex run migrations:backfillPerkEvents '{"dryRun":true,"cursor":"<continueCursor>"}' --prod  # until isDone
 *   bunx convex run migrations:backfillPerkEvents --prod
 *   bunx convex run migrations:backfillPerkEvents '{"dryRun":true}' --prod  # 0 left, every page
 */
export const backfillPerkEvents = internalMutation({
	args: PAGED_MIGRATION_ARGS,
	handler: async (context, { cursor, dryRun }) => {
		const page = await context.db.query("perkRequests").paginate({
			cursor: cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let requests = 0;
		let events = 0;
		for (const request of page.page) {
			const steps = await missingPerkSteps(context, request);
			if (steps.length === 0) continue;
			requests++;
			events += steps.length;
			if (dryRun === true) continue;
			for (const step of steps)
				await appendPerkEvent(context, request, step);
		}
		if (dryRun !== true && !page.isDone) {
			await context.scheduler.runAfter(
				0,
				internal.migrations.backfillPerkEvents,
				{ cursor: page.continueCursor }
			);
		}
		return {
			requests,
			events,
			isDone: page.isDone,
			continueCursor: page.continueCursor,
			dryRun: dryRun === true,
		};
	},
});

/** The kinds whose history row links to a perk (`?perk=`) or to one of its
 *  requests (`?request=`). */
const PERK_KINDS = new Set([
	"perkAdded",
	"perkExpiringSoon",
	"perkRequestOutcome",
	"perkRequested",
]);

/** Whether a perk-kind history row links to a perk or request that is gone.
 *  A row with neither parameter links to no perk, so it is kept. */
async function isOrphanPerkRow(
	context: QueryCtx,
	row: Doc<"notifications">
): Promise<boolean> {
	if (!PERK_KINDS.has(row.kind)) return false;
	const params = new URLSearchParams(row.url.split("?")[1] ?? "");
	const perk = params.get("perk");
	if (perk !== null) {
		const id = context.db.normalizeId("perks", perk);
		return id === null || (await context.db.get(id)) === null;
	}
	const request = params.get("request");
	if (request !== null) {
		const id = context.db.normalizeId("perkRequests", request);
		return id === null || (await context.db.get(id)) === null;
	}
	return false;
}

/**
 * One-off: delete the notification-history rows of perks deleted before
 * `deletePerk` purged them (`perks.purgePerkNotifications`): rows linking to
 * a perk or perk request that no longer exists. Re-running finds nothing.
 * Paged and dry-run as `backfillPerkEvents` is:
 *
 *   bunx convex run migrations:removeOrphanPerkNotifications '{"dryRun":true}' --prod
 *   bunx convex run migrations:removeOrphanPerkNotifications '{"dryRun":true,"cursor":"<continueCursor>"}' --prod  # until isDone
 *   bunx convex run migrations:removeOrphanPerkNotifications --prod
 *   bunx convex run migrations:removeOrphanPerkNotifications '{"dryRun":true}' --prod  # 0 orphans, every page
 */
export const removeOrphanPerkNotifications = internalMutation({
	args: PAGED_MIGRATION_ARGS,
	handler: async (context, { cursor, dryRun }) => {
		const page = await context.db.query("notifications").paginate({
			cursor: cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let orphans = 0;
		for (const row of page.page) {
			if (!(await isOrphanPerkRow(context, row))) continue;
			orphans++;
			if (dryRun !== true) await context.db.delete(row._id);
		}
		if (dryRun !== true && !page.isDone) {
			await context.scheduler.runAfter(
				0,
				internal.migrations.removeOrphanPerkNotifications,
				{ cursor: page.continueCursor }
			);
		}
		return {
			orphans,
			isDone: page.isDone,
			continueCursor: page.continueCursor,
			dryRun: dryRun === true,
		};
	},
});

/**
 * One-off: link every existing login to the person holding its email
 * (`linkLogin`, as a sign-in does). Re-running links nothing new.
 * Paged and dry-run as `backfillPerkEvents` is:
 *
 *   bunx convex run migrations:linkAuthUsers '{"dryRun":true}' --prod
 *   bunx convex run migrations:linkAuthUsers '{"dryRun":true,"cursor":"<continueCursor>"}' --prod  # until isDone
 *   bunx convex run migrations:linkAuthUsers --prod
 *   bunx convex run migrations:linkAuthUsers '{"dryRun":true}' --prod  # linked 0, every page
 */
export const linkAuthUsers = internalMutation({
	args: PAGED_MIGRATION_ARGS,
	handler: async (context, { cursor, dryRun }) => {
		const page = await authUsersPage(
			context,
			cursor ?? null,
			MIGRATION_PAGE_SIZE
		);
		const counts: Record<LinkOutcome, number> = {
			linked: 0,
			unchanged: 0,
			noPerson: 0,
			ambiguous: 0,
		};
		for (const user of page.page)
			counts[
				await linkLogin(context, user, { dryRun: dryRun === true })
			]++;
		if (dryRun !== true && !page.isDone) {
			await context.scheduler.runAfter(
				0,
				internal.migrations.linkAuthUsers,
				{
					cursor: page.continueCursor,
				}
			);
		}
		return {
			...counts,
			isDone: page.isDone,
			continueCursor: page.continueCursor,
			dryRun: dryRun === true,
		};
	},
});
