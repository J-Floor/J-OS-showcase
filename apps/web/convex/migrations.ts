import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
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
	handler: async (ctx) => {
		const people = await ctx.db.query("people").collect();
		const signatures = await ctx.db.query("signatures").collect();
		return {
			peopleAffected: people.filter((p) => p.accessFrom === WRONG).length,
			signaturesAffected: signatures.filter((s) => s.signedAt === WRONG)
				.length,
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
	handler: async (ctx) => {
		let peoplePatched = 0;
		for (const p of await ctx.db.query("people").collect()) {
			if (p.accessFrom === WRONG) {
				await ctx.db.patch(p._id, { accessFrom: CORRECT });
				peoplePatched++;
			}
		}
		let signaturesPatched = 0;
		for (const s of await ctx.db.query("signatures").collect()) {
			if (s.signedAt === WRONG) {
				await ctx.db.patch(s._id, { signedAt: CORRECT });
				signaturesPatched++;
			}
		}
		return { peoplePatched, signaturesPatched };
	},
});

// `people.email` is the identity key, and every `by_email` lookup now passes
// its input through `normalizeEmail`. Rows written before that may still carry
// capitals, and no lookup can find them until they are lowercased. Run once on
// prod right after deploying:
//   bunx convex run migrations:findEmailCollisions --prod   # resolve by hand first
//   bunx convex run migrations:migrateEmailCase --prod
//   bunx convex run migrations:previewEmailCase --prod      # page until empty

const MIGRATION_PAGE_SIZE = 100;

/**
 * Read-only: the people on this page whose email is not in canonical form.
 * Pass `continueCursor` back as `cursor` until `isDone`.
 */
export const previewEmailCase = internalQuery({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("people").paginate({
			cursor: cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		return {
			nonCanonical: page.page
				.filter((p) => p.email !== normalizeEmail(p.email))
				.map((p) => ({ _id: p._id, email: p.email })),
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
	handler: async (ctx) => {
		const groups = groupByNormalizedEmail(
			await ctx.db.query("people").collect()
		);
		return [...groups].map(([email, people]) => ({
			email,
			people: people.map((p) => ({ _id: p._id, email: p.email })),
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
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("people").paginate({
			cursor: cursor ?? null,
			numItems: MIGRATION_PAGE_SIZE,
		});
		let peoplePatched = 0;
		let collisions = 0;
		for (const p of page.page) {
			const email = normalizeEmail(p.email);
			if (email === p.email) continue;
			// `.first()`, not `.unique()`: exact duplicates may already exist,
			// and a throw here would stop the whole scheduled chain.
			const holder = await peopleByEmail(ctx, email).first();
			if (holder !== null) {
				collisions++;
				continue;
			}
			await ctx.db.patch(p._id, { email });
			peoplePatched++;
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(
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
	handler: async (ctx): Promise<{ set: number }> => {
		let set = 0;
		for (const person of await ctx.db.query("people").collect()) {
			if (person.activatedAt !== undefined) continue;
			let at: number | undefined;
			if (isMembershipActive(stateOf(person))) {
				at = person.stageSince;
			} else if (
				person.tier === "former" ||
				(person.tier === "guest" && person.stage === "expired")
			) {
				const events = await ctx.db
					.query("personEvents")
					.withIndex("by_person", (q) => q.eq("personId", person._id))
					.collect();
				at = events
					.toSorted((a, b) => a.at - b.at)
					.find(
						(e) =>
							e.kind === "transition" &&
							e.to !== undefined &&
							isStateId(e.to) &&
							isMembershipActive(e.to)
					)?.at;
			}
			if (at === undefined) continue;
			await ctx.db.patch(person._id, { activatedAt: at });
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
	handler: async (ctx, { personId }) => {
		const person = await ctx.db.get(personId);
		if (person?.tier !== "guest" || person.stage !== "active")
			throw new Error("Not an active guest.");
		const sigs = await ctx.db
			.query("signatures")
			.withIndex("by_person", (q) => q.eq("personId", personId))
			.collect();
		if (
			compliance(
				person,
				sigs.map((s) => s.variant)
			) === "met"
		)
			throw new Error("This guest has a guest agreement.");
		const now = Date.now();
		// Written outside applyEvent on purpose: the machine has no active-to-onboarding edge.
		// The document step re-opens too, or a guest who ticked it signing
		// another agreement would have nothing left to sign.
		await ctx.db.patch(personId, {
			stage: "onboarding",
			stageSince: now,
			onboarding: onboardingWithoutStep(person.onboarding, "document"),
		});
		await ctx.db.insert("personEvents", {
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
