import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { confirmEmailChange as confirmEmailChangeEmail } from "./emails/generated/confirmEmailChange.ts";
import { emailChanged } from "./emails/generated/emailChanged.ts";
import { confirmUrl, emailUrls } from "./emails/urls.ts";
import { requireRole } from "./lib/authGuard.ts";
import { authRecordsFor } from "./lib/authRecords.ts";
import {
	issueToken,
	liveTokens,
	newConfirmToken,
	redeemRow,
	revokeTokens,
	tokenRow,
} from "./lib/confirmToken.ts";
import { VERIFY_TTL_MS } from "./lib/constants.ts";
import { personForCurrentUser } from "./lib/currentPerson.ts";
import { entitled, personStatus, type PersonStatus } from "./lib/derive.ts";
import { sendEmail } from "./lib/email.ts";
import {
	EMAIL_IN_USE,
	EMAIL_INVALID,
	normalizeEmail,
	peopleByEmail,
	personByEmail,
	validEmail,
} from "./lib/emailAddress.ts";
import {
	addressesHeldBy,
	addressesOf,
	legacyDoorRows,
	ownedBy,
} from "./lib/erasure.ts";
import { IllegalTransitionError } from "./lib/lifecycleTypes.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_STEPS } from "./lib/onboardingSteps.ts";
import {
	documentsNaming,
	overBudget,
	pathsNaming,
	readBudget,
	takeCharged,
} from "./lib/peopleRefs.ts";
import { boardLevelView, selfView } from "./lib/personViews.ts";
import {
	ACCESS_TIERS,
	BOARD_LEVEL,
	COMMUNITY_TIERS,
	isAccessTier,
	isBoardLevel,
	ROLE_TIERS,
} from "./lib/roles.ts";
import { isModulePath } from "./lib/routes.ts";
import { assertSafeLinks } from "./lib/safeUrl.ts";
import {
	PHONE_MAX,
	REFERRAL_MAX,
	TEXT_MAX,
	VENTURE_NAME_MAX,
	assertLen,
} from "./lib/validate.ts";
import {
	applyEvent,
	currentActorId,
	logFieldEdit,
	roleTier,
} from "./lifecycle.ts";
import { scheduleLinkCheck } from "./linkSafety.ts";
import { fundingStage, productStage, vertical } from "./schema.ts";

// Internal: lets a scheduled approval action read the committed person row to
// choose the member/guest email variant (and the guest window).
export const getPersonByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, { email }) => personByEmail(ctx, email),
});

/**
 * Everything held about one person, for an access request (nDSG art. 25).
 * For each person row on the address: the row, their own records in full
 * (`personId` is theirs), a download URL for each signed agreement PDF, and
 * for every other document that names them (found from the schema,
 * `lib/peopleRefs#documentsNaming`) only where it does — `{ table, id,
 * field }` — never that document, which is someone else's data. Then every
 * address they have used that no one else holds now, the door-log rows
 * stored under those addresses before `personId` was, and the sign-in records
 * under each, session and account secrets left out. Internal, so only an
 * operator holding the deploy key can run it.
 * Run: bunx convex run people:exportPerson '{"email":"x@example.org"}' --prod
 */
export const exportPerson = internalQuery({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const budget = readBudget();
		const rows = await takeCharged(peopleByEmail(ctx, email), budget);
		if (!rows) throw new Error(overBudget("people"));
		const used = new Set<string>();
		const people = [];
		for (const person of rows) {
			const scan = await documentsNaming(ctx, person._id, budget);
			if ("problem" in scan) throw new Error(scan.problem);
			for (const address of addressesOf(person, scan.docs))
				used.add(address);
			const records: Record<string, unknown[]> = {};
			const references = [];
			const agreementPdfs = [];
			for (const { table, doc } of scan.docs) {
				if (doc._id === person._id) continue;
				if (!ownedBy(doc, person._id)) {
					for (const field of pathsNaming(doc, person._id))
						references.push({ table, id: doc._id, field });
					continue;
				}
				(records[table] ??= []).push(doc);
				const { fileId } = doc as unknown as Partial<Doc<"signatures">>;
				if (table === "signatures" && fileId)
					agreementPdfs.push({
						signatureId: doc._id,
						url: await ctx.storage.getUrl(fileId),
					});
			}
			people.push({ person, records, references, agreementPdfs });
		}
		const own = await addressesHeldBy(
			ctx,
			[...used],
			new Set(rows.map((p) => p._id)),
			budget
		);
		if ("problem" in own) throw new Error(own.problem);
		const door = await legacyDoorRows(ctx, own.addresses, budget);
		if ("problem" in door) throw new Error(door.problem);
		const auth = [];
		for (const address of own.addresses)
			auth.push({ address, ...(await authRecordsFor(ctx, address)) });
		return {
			people,
			addresses: own.addresses,
			legacyDoorLog: door.rows,
			auth,
		};
	},
});

export const getCurrentRole = query({
	args: {},
	handler: async (ctx) => {
		const person = await personForCurrentUser(ctx);
		// Prospects, former people and visitors are not access tiers, and an
		// expired or not-yet-started window reads as no access — matching
		// requireRole. (Visitors are registration-only: no sign-in, no web app.)
		if (
			!person ||
			!isAccessTier(person.tier) ||
			!entitled(person, Date.now())
		)
			return "none";
		return person.tier;
	},
});

export const getCurrentPerson = query({
	args: {},
	handler: async (ctx) => {
		const person = await requireRole(ctx, ACCESS_TIERS);
		return selfView(person);
	},
});

/**
 * Add someone straight into a role from the CLI, for people who skip the
 * application: staff, a new board member, a member the board already knows.
 *
 *   bunx convex run people:addDirect '{"email":"…","firstName":"…","lastName":"…","tier":"staff"}'
 *
 * Always one machine move, so the add is audited and lands in a legal state:
 * staff, board and admin go to `.active`; member and core go to `.onboarding`
 * until they sign. An existing email is moved, not duplicated, and its names
 * are kept: `firstName` and `lastName` are ignored for an existing person. A
 * visitor has no role move, so adding one is refused. No `guest`: a guest needs
 * a window and a host, which is the console's `APPROVE_GUEST`.
 */
export const addDirect = internalMutation({
	args: {
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		tier: roleTier,
	},
	handler: async (ctx, { email, firstName, lastName, tier }) => {
		const normalized = normalizeEmail(email);
		if (!validEmail(normalized)) throw new ConvexError(EMAIL_INVALID);
		const existing = await personByEmail(ctx, normalized);
		const personId =
			existing?._id ??
			(await ctx.db.insert("people", {
				email: normalized,
				firstName,
				lastName,
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "manual",
				door: { override: "none" },
			}));
		try {
			await applyEvent(ctx, personId, { type: "SET_ROLE", tier });
		} catch (err) {
			if (!(err instanceof IllegalTransitionError)) throw err;
			throw new ConvexError(
				`${normalized} is in ${err.from}, which has no role move. Nothing was changed.`
			);
		}
		return personId;
	},
});

// Remember the last route the current user viewed, so `/` can redirect back to
// it across devices. Needs an entitled access-tier person, and ignores
// anything that isn't a real module path so only a navigable route is stored.
export const setLastPath = mutation({
	args: { path: v.string() },
	handler: async (ctx, { path }) => {
		if (!isModulePath(path)) return;
		const person = await requireRole(ctx, ACCESS_TIERS);
		await ctx.db.patch(person._id, { lastPath: path });
	},
});

/**
 * `logFieldEdit` (`lifecycle.ts`) is documented scalars-only and compares with
 * `===`, so an array field (only `vertical` reaches it from `update`) would
 * never compare equal to a re-selection of the exact same values — every save
 * would log a spurious edit. Shallow-compares arrays; falls back to `===` for
 * everything else.
 */
function sameValue(before: unknown, after: unknown): boolean {
	if (Array.isArray(before) && Array.isArray(after)) {
		return (
			before.length === after.length &&
			before.every((v, i) => v === after[i])
		);
	}
	return before === after;
}

/**
 * The board's single field editor for a person, covering both the profile
 * fields and the venture/notes fields that used to live on `applications`.
 * Only the keys passed are written, and every one of them is logged to the
 * timeline with its before and after values.
 *
 * Workflow (tier, stage, access window, door) is NOT here: those are machine
 * events and their own mutations.
 *
 * `email` IS here — the drawer has always offered it — but it is guarded. It is
 * the identity key: `requireRole` (`lib/authGuard.ts`) and
 * `personForCurrentUser` (`people.ts`) both look a person up by `by_email` with
 * `.unique()`. Before this task the drawer's email field edited an
 * `applications` row and could not lock anyone out; now a board typo would, and
 * a collision would make `.unique()` throw for BOTH people. Hence the explicit
 * uniqueness check.
 *
 * A changed email is never written here. Whoever controls the new address
 * would own the account, so the change waits for that address to confirm it
 * (`confirmEmailChange`); `update` only mails the confirm link and returns
 * `{ emailChange: "pending" }`. The other fields in the same call apply now.
 */
export const update = mutation({
	args: {
		id: v.id("people"),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		vertical: v.optional(v.array(vertical)),
		// venture.*
		ventureName: v.optional(v.string()),
		description: v.optional(v.string()),
		whyJoin: v.optional(v.string()),
		pastBuilt: v.optional(v.string()),
		referral: v.optional(v.string()),
		teamSize: v.optional(v.number()),
		productStage: v.optional(productStage),
		fundingStage: v.optional(fundingStage),
	},
	handler: async (ctx, args): Promise<{ emailChange: "pending" } | null> => {
		await requireRole(ctx, BOARD_LEVEL);
		assertLen(args.phone, PHONE_MAX, "Phone");
		assertLen(args.ventureName, VENTURE_NAME_MAX, "Venture name");
		assertLen(args.description, TEXT_MAX, "Description");
		assertLen(args.whyJoin, TEXT_MAX, "Why join");
		assertLen(args.pastBuilt, TEXT_MAX, "Past built");
		assertLen(args.referral, REFERRAL_MAX, "Referral");
		const {
			id,
			ventureName,
			description,
			whyJoin,
			pastBuilt,
			referral,
			teamSize,
			productStage: nextProductStage,
			fundingStage: nextFundingStage,
			...top
		} = args;
		if (top.email !== undefined) top.email = normalizeEmail(top.email);
		const person = await ctx.db.get(id);
		if (!person) throw new Error("Person not found");
		const actorId = await currentActorId(ctx);

		// Any email edit supersedes a change still waiting on its link: a new
		// address replaces it, and re-entering the stored one withdraws it.
		if (top.email !== undefined) await revokeTokens(ctx, id, "emailChange");

		// Email is the identity key (`by_email` + `.unique()` in requireRole and
		// personForCurrentUser). A duplicate would lock two people out at once,
		// and a typo locks the person out: their next sign-in finds nobody. An
		// email that only differs from the stored one by case or spacing is
		// unchanged and left alone, so a legacy malformed one still saves and
		// a case-only duplicate is left for `migrateEmailCase` to report.
		if (
			top.email !== undefined &&
			top.email === normalizeEmail(person.email)
		)
			delete top.email;
		const newEmail = top.email;
		delete top.email;
		if (newEmail !== undefined) {
			if (!validEmail(newEmail)) throw new ConvexError(EMAIL_INVALID);
			const clash = await personByEmail(ctx, newEmail);
			if (clash) throw new ConvexError(EMAIL_IN_USE);
		}

		for (const [field, after] of Object.entries(top)) {
			const before = (person as Record<string, unknown>)[field];
			// `logFieldEdit` is scalars-only and compares with `===` — an array
			// (only `vertical` reaches this loop as one) is never `===` its own
			// re-selected content, so re-saving the SAME verticals would log a
			// spurious edit on every save without this shallow check.
			if (sameValue(before, after)) continue;
			await logFieldEdit(ctx, id, field, before, after, actorId);
		}
		if (Object.keys(top).length > 0) await ctx.db.patch(id, top);

		const ventureEdits: Record<string, unknown> = {
			name: ventureName,
			description,
			whyJoin,
			pastBuilt,
			referral,
			teamSize,
			productStage: nextProductStage,
			fundingStage: nextFundingStage,
		};
		// A plain, explicitly-typed copy of the "before" values: indexing THIS
		// with a computed key needs no assertion under either tsconfig, unlike
		// indexing `person.venture` directly (its schema-derived object type has
		// no index signature).
		const ventureBefore: Record<string, unknown> = {
			...(person.venture ?? {}),
		};
		const venturePatch: Record<string, unknown> = {};
		for (const [key, after] of Object.entries(ventureEdits)) {
			if (after === undefined) continue;
			await logFieldEdit(
				ctx,
				id,
				`venture.${key}`,
				ventureBefore[key],
				after,
				actorId
			);
			venturePatch[key] = after;
		}
		if (Object.keys(venturePatch).length > 0) {
			await ctx.db.patch(id, {
				venture: { ...(person.venture ?? {}), ...venturePatch },
			});
		}

		if (newEmail === undefined) return null;
		await ctx.scheduler.runAfter(0, internal.people.sendEmailChangeLink, {
			personId: id,
			newEmail,
			actorId,
		});
		return { emailChange: "pending" };
	},
});

/**
 * Mints the email-change confirm token (an action: tokens need real
 * randomness), records its hash, and mails the link to the NEW address. The
 * mail carries nothing about the person: the board may have mistyped the
 * address, so it could reach a stranger.
 */
export const sendEmailChangeLink = internalAction({
	args: {
		personId: v.id("people"),
		newEmail: v.string(),
		actorId: v.optional(v.id("people")),
	},
	handler: async (ctx, { personId, newEmail, actorId }) => {
		const token = newConfirmToken();
		const issued = await ctx.runMutation(
			internal.people.issueEmailChangeToken,
			{ personId, newEmail, token, actorId }
		);
		if (!issued) return;
		const { html, text } = confirmEmailChangeEmail({
			confirmUrl: confirmUrl("emailChange", token),
			logoUrl: emailUrls().logoUrl,
		});
		await sendEmail({
			to: newEmail,
			subject: "Confirm your new J floor sign-in address",
			html,
			text,
			devLog: `[email-change] ${newEmail} ${confirmUrl("emailChange", token)}`,
		});
	},
});

/** Records an email-change token; false when the person is gone. */
export const issueEmailChangeToken = internalMutation({
	args: {
		personId: v.id("people"),
		newEmail: v.string(),
		token: v.string(),
		actorId: v.optional(v.id("people")),
	},
	handler: async (ctx, args): Promise<boolean> => {
		if (!(await ctx.db.get(args.personId))) return false;
		await issueToken(ctx, {
			token: args.token,
			purpose: "emailChange",
			personId: args.personId,
			ttlMs: VERIFY_TTL_MS,
			newEmail: args.newEmail,
			actorId: args.actorId,
		});
		return true;
	},
});

/** Board-only: the address a person's email change is waiting on, if any. */
export const pendingEmailChange = query({
	args: { personId: v.id("people") },
	handler: async (
		ctx,
		{ personId }
	): Promise<{ newEmail: string } | null> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await liveTokens(
			ctx.db,
			personId,
			"emailChange",
			Date.now()
		);
		const row = rows.at(0);
		return row?.newEmail === undefined ? null : { newEmail: row.newEmail };
	},
});

/** Board-only: withdraw a person's pending email change; its link stops working. */
export const cancelEmailChange = mutation({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		await requireRole(ctx, BOARD_LEVEL);
		await revokeTokens(ctx, personId, "emailChange");
	},
});

export type EmailChangeStatus = "verified" | "invalid" | "expired" | "taken";

/**
 * The `/email/confirm` link: moves the person to the address the board
 * entered, now that the address itself has confirmed it. Re-checks the clash
 * (someone may have taken the address since) and tells the OLD address.
 * A repeat click on a link that already went through answers "verified".
 */
export const confirmEmailChange = mutation({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<{ status: EmailChangeStatus }> => {
		const r = await redeemRow(
			ctx,
			await tokenRow(ctx.db, token),
			"emailChange"
		);
		if (r.status === "invalid") return { status: "invalid" };
		const newEmail = r.row.newEmail;
		const person = await ctx.db.get(r.row.personId);
		if (!person || newEmail === undefined) return { status: "invalid" };
		if (r.status === "already")
			return {
				status: person.email === newEmail ? "verified" : "invalid",
			};
		if (r.status === "expired") return { status: "expired" };
		const clash = await personByEmail(ctx, newEmail);
		if (clash && clash._id !== person._id) return { status: "taken" };
		const oldEmail = person.email;
		await logFieldEdit(
			ctx,
			person._id,
			"email",
			oldEmail,
			newEmail,
			r.row.actorId
		);
		await ctx.db.patch(person._id, { email: newEmail });
		await ctx.scheduler.runAfter(
			0,
			internal.people.sendEmailChangedNotice,
			{
				oldEmail,
				newEmail,
			}
		);
		return { status: "verified" };
	},
});

/** Tells the old address that the sign-in address moved. */
export const sendEmailChangedNotice = internalAction({
	args: { oldEmail: v.string(), newEmail: v.string() },
	handler: async (_ctx, { oldEmail, newEmail }) => {
		const { html, text } = emailChanged({
			newEmail,
			logoUrl: emailUrls().logoUrl,
		});
		await sendEmail({
			to: oldEmail,
			subject: "Your J floor sign-in address was changed",
			html,
			text,
			devLog: `[email-changed] ${oldEmail} -> ${newEmail}`,
		});
	},
});

/**
 * Self-serve profile edit for a signed-in non-board person. Unlike `update`
 * (board-only, takes an `id`), this resolves the caller's OWN row via
 * `personForCurrentUser` — there is NO `id` argument, so a member can only ever
 * edit themselves. Only the whitelisted fields below are writable; identity
 * (email/name), role/lifecycle (tier/stage) and the application answers
 * (whyJoin/pastBuilt/referral) are structurally absent from the args and are
 * carried through the venture merge untouched.
 *
 * `venture.links` is an array of objects; `logFieldEdit` is scalars-only, so it
 * is patched without a per-field audit row.
 */
export const updateOwnProfile = mutation({
	args: {
		phone: v.optional(v.string()),
		vertical: v.optional(v.array(vertical)),
		// venture.*
		ventureName: v.optional(v.string()),
		description: v.optional(v.string()),
		teamSize: v.optional(v.number()),
		productStage: v.optional(productStage),
		fundingStage: v.optional(fundingStage),
		links: v.optional(
			v.array(v.object({ label: v.string(), url: v.string() }))
		),
	},
	handler: async (ctx, args) => {
		// Same gate as `getCurrentPerson`: only a real, entitled access-tier
		// person (guest/member/core/board/admin/staff) — NOT a prospect or former
		// member, whom `entitled` alone does not exclude (see getCurrentRole).
		const person = await requireRole(ctx, ACCESS_TIERS);
		assertLen(args.phone, PHONE_MAX, "Phone");
		assertLen(args.ventureName, VENTURE_NAME_MAX, "Venture name");
		assertLen(args.description, TEXT_MAX, "Description");

		const {
			ventureName,
			description,
			teamSize,
			productStage: nextProductStage,
			fundingStage: nextFundingStage,
			links,
			...top
		} = args;
		const actorId = await currentActorId(ctx);

		for (const [field, after] of Object.entries(top)) {
			const before = (person as Record<string, unknown>)[field];
			if (sameValue(before, after)) continue;
			await logFieldEdit(ctx, person._id, field, before, after, actorId);
		}
		if (Object.keys(top).length > 0) await ctx.db.patch(person._id, top);

		const ventureScalars: Record<string, unknown> = {
			name: ventureName,
			description,
			teamSize,
			productStage: nextProductStage,
			fundingStage: nextFundingStage,
		};
		const ventureBefore: Record<string, unknown> = {
			...(person.venture ?? {}),
		};
		const venturePatch: Record<string, unknown> = {};
		for (const [key, after] of Object.entries(ventureScalars)) {
			if (after === undefined) continue;
			await logFieldEdit(
				ctx,
				person._id,
				`venture.${key}`,
				ventureBefore[key],
				after,
				actorId
			);
			venturePatch[key] = after;
		}
		if (links !== undefined) {
			venturePatch.links = assertSafeLinks(links);
		}

		if (Object.keys(venturePatch).length > 0) {
			await ctx.db.patch(person._id, {
				venture: { ...(person.venture ?? {}), ...venturePatch },
			});
		}
		await scheduleLinkCheck(ctx, person._id, links);
		return null;
	},
});

/**
 * Append an attributed board note. Notes are a thread now — one entry per remark,
 * each carrying who wrote it (the acting board member) and when — so this pushes
 * rather than overwrites, and there is no single string to clobber. Board-gated;
 * a blank note is dropped rather than stored.
 */
export const addNote = mutation({
	args: { id: v.id("people"), text: v.string() },
	handler: async (ctx, { id, text }) => {
		await requireRole(ctx, BOARD_LEVEL);
		assertLen(text, TEXT_MAX, "Note");
		const trimmed = text.trim();
		if (trimmed === "") return null;
		const person = await ctx.db.get(id);
		if (!person) throw new Error("Person not found");
		const actorId = await currentActorId(ctx);
		const board = person.board ?? {};
		await ctx.db.patch(id, {
			board: {
				...board,
				noteLog: [
					...(board.noteLog ?? []),
					{
						authorId: actorId ?? undefined,
						text: trimmed,
						at: Date.now(),
					},
				],
			},
		});
		return null;
	},
});

/**
 * Extend (or open) a guest's access window. Always dated: the machine's
 * EXTEND_WINDOW carries an instant, and an open-ended guest window is what made
 * "expired" unrepresentable in the first place.
 */
export const setGuestAccess = mutation({
	args: { id: v.id("people"), expiresAt: v.number() },
	handler: async (ctx, { id, expiresAt }) => {
		await requireRole(ctx, BOARD_LEVEL);
		await applyEvent(
			ctx,
			id,
			{ type: "EXTEND_WINDOW", until: expiresAt },
			await currentActorId(ctx)
		);
		return null;
	},
});

// Board-gated edit of a guest's "hosted by" reference: the board member who
// vouches for the guest (`hostedById`). `hostedById: null` clears the value so a
// cell can be blanked in-table. Setting a host id also clears any legacy
// `hostedBy` name — the id is canonical. (The old free-text `hostNote` was folded
// into the attributed board notes thread and dropped in a past migration.)
export const setHost = mutation({
	args: {
		id: v.id("people"),
		hostedById: v.optional(v.union(v.id("people"), v.null())),
	},
	handler: async (ctx, { id, hostedById }) => {
		await requireRole(ctx, BOARD_LEVEL);
		const person = await ctx.db.get(id);
		if (!person) throw new Error("Person not found");
		const actorId = await currentActorId(ctx);

		const patch: Partial<Doc<"people">> = {};
		if (hostedById !== undefined) {
			patch.hostedById = hostedById ?? undefined;
			// Setting a host id clears the legacy display-name fallback: the id
			// is canonical.
			patch.hostedBy = undefined;
			await logFieldEdit(
				ctx,
				id,
				"hostedById",
				person.hostedById,
				patch.hostedById,
				actorId
			);
			await logFieldEdit(
				ctx,
				id,
				"hostedBy",
				person.hostedBy,
				undefined,
				actorId
			);
		}
		await ctx.db.patch(id, patch);
		return null;
	},
});

/**
 * The signature `getAgreementUrl` would serve for this person: the most recent
 * one. Shared by the roster (which only needs to know whether there is one) and
 * by the URL query itself, so "the button is enabled" and "the click resolves
 * to a document" can never disagree — an older signature with a file behind a
 * newer one with neither must still read as nothing to show.
 */
function latestSignature<
	S extends { signedAt: number; fileId?: unknown; sourceUrl?: string },
>(signatures: S[]): S | undefined {
	const latest = signatures.reduce<S | undefined>(
		(acc, s) => (acc === undefined || s.signedAt > acc.signedAt ? s : acc),
		undefined
	);
	if (latest === undefined) return undefined;
	return latest.fileId !== undefined || latest.sourceUrl !== undefined
		? latest
		: undefined;
}

/** A roster row: the person, their status readout, and whether the "view
 *  agreement" button should be live. */
export type PersonRow = Doc<"people"> & {
	status: PersonStatus;
	hasAgreement: boolean;
};

/**
 * Attach the single status readout to every row, so the table, the drawer and
 * the row grouping cannot tell three different stories. Resolves `door.byId` to
 * a name where there is one — only rows with an override pay for that read.
 *
 * `hasAgreement` rides along because it falls out of the signature read this
 * function already does. The alternative — every row mounting its own
 * `getAgreementUrl` subscription to decide whether to grey out one button —
 * cost one live query and one signed-URL round trip PER ROW, several hundred
 * of them on first paint. The URL itself is still fetched on click, by the one
 * row the board actually asked about.
 */
/**
 * Read only the people in the given tiers, via the `by_tier` index, instead of
 * `collect()`-ing the entire table and filtering in memory.
 *
 * The roster lists below are LIVE subscriptions (kept warm at the shell), so they
 * re-run on every write to any `people` row. A full-table `collect()` per run —
 * reading every document in full, venture text and note thread included — was the
 * dominant DB-IO cost (≈1 GB/month). Reading just the relevant tiers cuts each
 * run to a fraction of the table.
 */
export async function peopleByTiers(
	ctx: QueryCtx,
	tiers: readonly Doc<"people">["tier"][]
): Promise<Doc<"people">[]> {
	const groups = await Promise.all(
		tiers.map((tier) =>
			ctx.db
				.query("people")
				.withIndex("by_tier", (q) => q.eq("tier", tier))
				.collect()
		)
	);
	return groups.flat();
}

export async function withStatus(
	ctx: QueryCtx,
	rows: Doc<"people">[]
): Promise<PersonRow[]> {
	const now = Date.now();
	return Promise.all(
		rows.map(async (person) => {
			const signatures = await ctx.db
				.query("signatures")
				.withIndex("by_person", (q) => q.eq("personId", person._id))
				.collect();
			const actorId = person.door?.byId;
			const actor =
				actorId === undefined ? null : await ctx.db.get(actorId);
			return {
				...person,
				status: personStatus(
					person,
					signatures.map((s) => s.variant),
					now,
					actor === null ? undefined : displayName(actor)
				),
				hasAgreement: latestSignature(signatures) !== undefined,
			};
		})
	);
}

/**
 * The Members tab: every access tier above guest, plus the people who left or
 * were kicked out of one. Placement follows the LAST tier — a former member
 * stays here rather than moving tab when their status changes.
 */
export const listMembers = query({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = (
			await peopleByTiers(ctx, [...ROLE_TIERS, "former"])
		).filter((p) => p.tier !== "former" || p.formerOf !== "guest");
		return withStatus(ctx, rows);
	},
});

// Member-facing board contact directory: active *board* members with their
// names + phone. Admins share board-level permissions but are not on the board,
// so they are intentionally excluded here (filter on `tier === "board"`, NOT
// isBoardLevel). Any signed-in person, staff included, may read it.
export const listBoardContacts = query({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, ACCESS_TIERS);
		const now = Date.now();
		// `tier === "board"`, NOT isBoardLevel: admins share board-level
		// permissions but are not on the board, and this is the member-facing
		// board directory.
		const people = await peopleByTiers(ctx, ["board"]);
		return people
			.filter((p) => p.tier === "board" && entitled(p, now))
			.map((p) => ({
				firstName: p.firstName,
				lastName: p.lastName,
				phone: p.phone,
			}));
	},
});

/** The Guests tab: guests at any stage, plus former guests. */
export const listGuests = query({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = (await peopleByTiers(ctx, ["guest", "former"])).filter(
			(p) =>
				p.tier === "guest" ||
				(p.tier === "former" && p.formerOf === "guest")
		);
		return withStatus(ctx, rows);
	},
});

// Board + admin with active access. Source for task-assignee and
// project-leader pickers in the Tasks module. Core members may read it (they
// see the Tasks board) but the list itself stays board-level only.
export const listBoardLevel = query({
	args: {},
	handler: async (ctx) => {
		await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		const now = Date.now();
		const people = await peopleByTiers(ctx, BOARD_LEVEL);
		return people
			.filter((p) => isBoardLevel(p.tier) && entitled(p, now))
			.map(boardLevelView);
	},
});

/**
 * Revoke access and keep the row. The machine records the tier they held, so
 * re-admitting a kicked core member returns them to core rather than to a
 * generic member, and the reconciler drops their lock authorizations.
 */
export const kickOut = mutation({
	args: { id: v.id("people") },
	handler: async (ctx, { id }) => {
		await requireRole(ctx, BOARD_LEVEL);
		await applyEvent(
			ctx,
			id,
			{ type: "KICK_OUT" },
			await currentActorId(ctx)
		);
		return null;
	},
});

/**
 * Guest → member. One event, four consequences declared by the reducer: the
 * document step re-opens, the memberUpgrade email goes out (not the fresh
 * approval one), the guest window clears, and the door does not blink.
 */
export const upgradeGuestToMember = mutation({
	args: { id: v.id("people") },
	handler: async (ctx, { id }) => {
		await requireRole(ctx, BOARD_LEVEL);
		await applyEvent(
			ctx,
			id,
			{ type: "PROMOTE_TO_MEMBER" },
			await currentActorId(ctx)
		);
		return null;
	},
});

/**
 * Tick an onboarding task only a board member can do (the WhatsApp group add).
 * No tier or stage changes, so this is not a machine event — but it is audited,
 * and it records WHO did it: the person to ask when the invite never arrives.
 */
export const completeBoardStep = mutation({
	args: { personId: v.id("people"), stepId: v.string() },
	handler: async (ctx, { personId, stepId }) => {
		await requireRole(ctx, BOARD_LEVEL);
		if (!BOARD_STEPS.some((step) => step.id === stepId)) {
			throw new Error(`Unknown board step: ${stepId}`);
		}
		const person = await ctx.db.get(personId);
		if (!person) throw new Error("Person not found");
		const actorId = await currentActorId(ctx);
		const boardSteps = {
			...(person.onboarding?.boardSteps ?? {}),
			[stepId]: { completedAt: Date.now(), byId: actorId },
		};
		await ctx.db.patch(personId, {
			onboarding: { ...(person.onboarding ?? { steps: {} }), boardSteps },
		});
		await ctx.db.insert("personEvents", {
			personId,
			at: Date.now(),
			actorId,
			kind: "board_task",
			meta: stepId,
		});
		return null;
	},
});

/**
 * Tick a board step for many people at once, by email — for the board's own
 * records, run from the CLI (`bunx convex run people:markBoardStepDone`), e.g.
 * after checking who is actually in the WhatsApp group. Audited like
 * `completeBoardStep`, but with no actor: nobody is signed in. People already
 * ticked are left alone, so the first `completedAt` survives.
 */
export const markBoardStepDone = internalMutation({
	args: { stepId: v.string(), emails: v.array(v.string()) },
	handler: async (
		ctx,
		{ stepId, emails }
	): Promise<{
		marked: string[];
		alreadyDone: string[];
		unknown: string[];
	}> => {
		if (!BOARD_STEPS.some((step) => step.id === stepId))
			throw new Error(`Unknown board step: ${stepId}`);
		const result = {
			marked: [] as string[],
			alreadyDone: [] as string[],
			unknown: [] as string[],
		};
		const now = Date.now();
		for (const email of emails) {
			const person = await personByEmail(ctx, email);
			if (!person) {
				result.unknown.push(email);
				continue;
			}
			const done = person.onboarding?.boardSteps ?? {};
			if (stepId in done) {
				result.alreadyDone.push(email);
				continue;
			}
			await ctx.db.patch(person._id, {
				onboarding: {
					...(person.onboarding ?? { steps: {} }),
					boardSteps: { ...done, [stepId]: { completedAt: now } },
				},
			});
			await ctx.db.insert("personEvents", {
				personId: person._id,
				at: now,
				kind: "board_task",
				meta: stepId,
			});
			result.marked.push(email);
		}
		return result;
	},
});

/**
 * Undo {@link markBoardStepDone} for these people: clear the step and the
 * timeline row it wrote, so the board task is open again. Only a tick with no
 * actor — one made from the CLI — is cleared; a board member's own tick from
 * the drawer is left alone and reported as `keptByBoard`.
 */
export const unmarkBoardStepDone = internalMutation({
	args: { stepId: v.string(), emails: v.array(v.string()) },
	handler: async (
		ctx,
		{ stepId, emails }
	): Promise<{
		unmarked: string[];
		notDone: string[];
		keptByBoard: string[];
		unknown: string[];
	}> => {
		if (!BOARD_STEPS.some((step) => step.id === stepId))
			throw new Error(`Unknown board step: ${stepId}`);
		const result = {
			unmarked: [] as string[],
			notDone: [] as string[],
			keptByBoard: [] as string[],
			unknown: [] as string[],
		};
		for (const email of emails) {
			const person = await personByEmail(ctx, email);
			if (!person) {
				result.unknown.push(email);
				continue;
			}
			const done = person.onboarding?.boardSteps ?? {};
			if (!(stepId in done)) {
				result.notDone.push(email);
				continue;
			}
			if (done[stepId].byId) {
				result.keptByBoard.push(email);
				continue;
			}
			await ctx.db.patch(person._id, {
				onboarding: {
					...(person.onboarding ?? { steps: {} }),
					boardSteps: Object.fromEntries(
						Object.entries(done).filter(([id]) => id !== stepId)
					),
				},
			});
			const events = await ctx.db
				.query("personEvents")
				.withIndex("by_person", (q) => q.eq("personId", person._id))
				.collect();
			for (const e of events)
				if (
					e.kind === "board_task" &&
					e.meta === stepId &&
					e.actorId === undefined
				)
					await ctx.db.delete(e._id);
			result.unmarked.push(email);
		}
		return result;
	},
});

/**
 * Record the first time the current person opened the Wi-Fi dialog. Idempotent:
 * a person who has already opened it once writes no further rows. Board-only
 * audit (personEvents is never shown to the person).
 */
export const logWifiOpen = mutation({
	args: {},
	handler: async (ctx) => {
		const person = await requireRole(ctx, ACCESS_TIERS);
		const events = await ctx.db
			.query("personEvents")
			.withIndex("by_person", (q) => q.eq("personId", person._id))
			.collect();
		if (events.some((e) => e.kind === "wifi")) return null;
		await ctx.db.insert("personEvents", {
			personId: person._id,
			at: Date.now(),
			actorId: person._id,
			kind: "wifi",
		});
		return null;
	},
});

// Board-gated: latest signed-agreement URL for a person. In-app signatures
// store a PDF in _storage (`fileId`); legacy Notion imports carry only a
// `sourceUrl`. Returns null when the person has no signature on file.
export const getAgreementUrl = query({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		await requireRole(ctx, BOARD_LEVEL);
		const sigs = await ctx.db
			.query("signatures")
			.withIndex("by_person", (q) => q.eq("personId", personId))
			.collect();
		const latest = latestSignature(sigs);
		if (!latest) return null;
		if (latest.fileId) return await ctx.storage.getUrl(latest.fileId);
		return latest.sourceUrl ?? null;
	},
});

// Board-gated: the events a person attended, for the "Came from" line in the
// drawer. Joins `eventAttendance` (`by_person`) to `events`; an attendance row
// whose event was since deleted is skipped rather than surfaced as a broken
// reference.
export const attendedEvents = query({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db
			.query("eventAttendance")
			.withIndex("by_person", (q) => q.eq("personId", personId))
			.collect();
		const out: {
			eventId: Id<"events">;
			name: string;
			confirmedAt: number;
		}[] = [];
		for (const row of rows) {
			const event = await ctx.db.get(row.eventId);
			if (event !== null)
				out.push({
					eventId: row.eventId,
					name: event.name,
					confirmedAt: row.confirmedAt,
				});
		}
		return out;
	},
});

/**
 * Whether the caller takes part in the community (guest and up, not staff,
 * inside their window) — the gate for actions, which cannot call `requireRole`
 * themselves.
 */
export const callerInCommunity = internalQuery({
	args: {},
	handler: async (ctx): Promise<boolean> => {
		try {
			await requireRole(ctx, COMMUNITY_TIERS);
			return true;
		} catch {
			return false;
		}
	},
});
