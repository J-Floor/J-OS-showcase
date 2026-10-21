import type { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
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
import type { PeopleError } from "./lib/errors/people.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_STEPS } from "./lib/onboardingSteps.ts";
import {
	documentsNaming,
	type Naming,
	pathsNaming,
	readBudget,
	takeCharged,
} from "./lib/peopleRefs.ts";
import { personStateOf, setPersonLastPath } from "./lib/personState.ts";
import { boardLevelView, selfView } from "./lib/personViews.ts";
import { invariant, refuse, unwrap, unwrapLogged } from "./lib/result.ts";
import {
	ACCESS_TIERS,
	BOARD_LEVEL,
	CORE_AND_BOARD,
	isAccessTier,
	isBoardLevel,
	ROLE_TIERS,
} from "./lib/roles.ts";
import { isModulePath } from "./lib/routes.ts";
import { parseSafeLinks } from "./lib/safeUrl.ts";
import {
	PHONE_MAX,
	REFERRAL_MAX,
	TEXT_MAX,
	VENTURE_NAME_MAX,
	checkLength,
} from "./lib/validate.ts";
import {
	applyEvent,
	currentActorId,
	logFieldEdit,
	roleTier,
} from "./lifecycle.ts";
import { scheduleLinkCheck } from "./linkSafety.ts";
import { fundingStage, productStage, vertical } from "./schema.ts";

/** The document's own fields, without Convex's `_id` and `_creationTime`. */
export function withoutSystemFields(
	doc: Doc<"people">
): WithoutSystemFields<Doc<"people">> {
	return Object.fromEntries(
		Object.entries(doc).filter(
			([key]) => key !== "_id" && key !== "_creationTime"
		)
	) as WithoutSystemFields<Doc<"people">>;
}

// Internal: lets a scheduled approval action read the committed person row to
// choose the member/guest email variant (and the guest window).
export const getPersonByEmail = internalQuery({
	args: { email: v.string() },
	handler: async (context, { email }) => personByEmail(context, email),
});

/** One person's own records in full, where else they are named, and a
 *  download URL for each signed agreement PDF. */
async function exportDocuments(
	context: QueryCtx,
	person: Doc<"people">,
	documents: Naming[]
) {
	const records: Record<string, unknown[]> = {};
	const references: { table: string; id: string; field: string }[] = [];
	const agreementPdfs: { signatureId: string; url: string | null }[] = [];
	for (const { table, doc } of documents) {
		if (doc._id === person._id) continue;
		if (!ownedBy(doc, person._id)) {
			for (const field of pathsNaming(doc, person._id))
				references.push({ table, id: doc._id, field });
			continue;
		}
		const tableRecords = records[table] ?? [];
		tableRecords.push(doc);
		records[table] = tableRecords;
		const { fileId } = doc as unknown as Partial<Doc<"signatures">>;
		if (table === "signatures" && fileId)
			agreementPdfs.push({
				signatureId: doc._id,
				url: await context.storage.getUrl(fileId),
			});
	}
	return { person, records, references, agreementPdfs };
}

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
	handler: async (context, { email }) => {
		const budget = readBudget();
		const rows = unwrapLogged(
			await takeCharged(peopleByEmail(context, email), budget, "people"),
			"Export"
		);
		const used = new Set<string>();
		const people = [];
		for (const person of rows) {
			const namings = unwrapLogged(
				await documentsNaming(context, person._id, budget),
				"Export"
			);
			for (const address of addressesOf(person, namings))
				used.add(address);
			people.push(await exportDocuments(context, person, namings));
		}
		const addresses = unwrapLogged(
			await addressesHeldBy(
				context,
				[...used],
				new Set(rows.map((row) => row._id)),
				budget
			),
			"Export"
		);
		const legacyDoorLog = unwrapLogged(
			await legacyDoorRows(context, addresses, budget),
			"Export"
		);
		const auth = [];
		for (const address of addresses)
			auth.push({ address, ...(await authRecordsFor(context, address)) });
		return {
			people,
			addresses,
			legacyDoorLog,
			auth,
		};
	},
});

export const getCurrentRole = query({
	args: {},
	handler: async (context) => {
		const person = await personForCurrentUser(context);
		// Prospects, former people and visitors are not access tiers, and an
		// expired or not-yet-started window reads as no access — matching
		// requireRole. (Visitors are registration-only: no sign-in, no web app.)
		return person &&
			isAccessTier(person.tier) &&
			entitled(person, Date.now())
			? person.tier
			: "none";
	},
});

export const getCurrentPerson = query({
	args: {},
	handler: async (context) => {
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
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
	handler: async (context, { email, firstName, lastName, tier }) => {
		const normalized = normalizeEmail(email);
		if (!validEmail(normalized)) refuse({ type: "InvalidEmail" });
		const existing = await personByEmail(context, normalized);
		const personId =
			existing?._id ??
			(await context.db.insert("people", {
				email: normalized,
				firstName,
				lastName,
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
				provenance: "manual",
				door: { override: "none" },
			}));
		unwrapLogged(
			await applyEvent(context, personId, { type: "SET_ROLE", tier }),
			"Add person"
		);
		return personId;
	},
});

// Remember the last route the current user viewed, so `/` can redirect back to
// it across devices. Needs an entitled access-tier person, and ignores
// anything that isn't a real module path so only a navigable route is stored.
// Written to `personState`, never `people`: a `people` write re-runs every
// roster subscription.
export const setLastPath = mutation({
	args: { path: v.string() },
	handler: async (context, { path }) => {
		if (!isModulePath(path)) return;
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		await setPersonLastPath(context, person._id, path);
	},
});

/** The caller's last-viewed module route, or null. Read by `/` only. */
export const getLastPath = query({
	args: {},
	handler: async (context) => {
		const person = await personForCurrentUser(context);
		if (!person) return null;
		const state = await personStateOf(context, person._id);
		return state?.lastPath ?? null;
	},
});

/**
 * `logFieldEdit` (`lifecycle.ts`) is documented scalars-only and compares with
 * `===`, so an array field (only `vertical` reaches it from `update`) would
 * never compare equal to a re-selection of the exact same values — every save
 * would log a spurious edit. Shallow-compares arrays; falls back to `===` for
 * everything else.
 */
function isSameValue(before: unknown, after: unknown): boolean {
	return Array.isArray(before) && Array.isArray(after)
		? before.length === after.length &&
				before.every((item, index) => item === after[index])
		: before === after;
}

/** Log every changed top-level field to the timeline, then write them. */
async function applyFieldEdits(
	context: MutationCtx,
	person: Doc<"people">,
	edits: Partial<Doc<"people">>,
	actorId: Id<"people"> | undefined
): Promise<void> {
	for (const [field, after] of Object.entries(edits)) {
		const before = (person as Record<string, unknown>)[field];
		// `logFieldEdit` is scalars-only and compares with `===` — an array
		// (only `vertical` reaches this loop as one) is never `===` its own
		// re-selected content, so re-saving the SAME verticals would log a
		// spurious edit on every save without this shallow check.
		if (isSameValue(before, after)) continue;
		await logFieldEdit(context, {
			personId: person._id,
			field,
			before,
			after,
			actorId,
		});
	}
	if (Object.keys(edits).length > 0)
		await context.db.patch(person._id, edits);
}

/** Log every venture field that was passed, and return what to merge into the
 *  person's venture. */
async function logVentureEdits(
	context: MutationCtx,
	person: Doc<"people">,
	edits: Record<string, unknown>,
	actorId: Id<"people"> | undefined
): Promise<Record<string, unknown>> {
	// A plain, explicitly-typed copy of the "before" values: indexing THIS
	// with a computed key needs no assertion under either tsconfig, unlike
	// indexing `person.venture` directly (its schema-derived object type has
	// no index signature).
	const ventureBefore: Record<string, unknown> = {
		...(person.venture ?? {}),
	};
	const venturePatch: Record<string, unknown> = {};
	for (const [key, after] of Object.entries(edits)) {
		if (after === undefined) continue;
		await logFieldEdit(context, {
			personId: person._id,
			field: `venture.${key}`,
			before: ventureBefore[key],
			after,
			actorId,
		});
		venturePatch[key] = after;
	}
	return venturePatch;
}

/** Merge a venture patch into the person's venture, when there is one. */
async function patchVenture(
	context: MutationCtx,
	person: Doc<"people">,
	venturePatch: Record<string, unknown>
): Promise<void> {
	if (Object.keys(venturePatch).length === 0) return;
	await context.db.patch(person._id, {
		venture: { ...(person.venture ?? {}), ...venturePatch },
	});
}

/**
 * Resolve a requested email change: supersede any change still waiting on its
 * link, and return the new address to confirm, or undefined when there is
 * nothing to change.
 *
 * Email is the identity key (`by_email` + `.unique()` in requireRole and
 * personForCurrentUser). A duplicate would lock two people out at once, and a
 * typo locks the person out: their next sign-in finds nobody. An email that
 * only differs from the stored one by case or spacing is unchanged and left
 * alone, so a legacy malformed one still saves and a case-only duplicate is
 * left for `migrateEmailCase` to report.
 */
async function resolveEmailChange(
	context: MutationCtx,
	person: Doc<"people">,
	requested: string | undefined
): Promise<Result<string | undefined, PeopleError>> {
	if (requested === undefined) return ok(undefined);
	const newEmail = normalizeEmail(requested);
	// Any email edit supersedes a change still waiting on its link: a new
	// address replaces it, and re-entering the stored one withdraws it.
	await revokeTokens(context, person._id, "emailChange");
	if (newEmail === normalizeEmail(person.email)) return ok(undefined);
	if (!validEmail(newEmail)) return err({ type: "InvalidEmail" });
	const clash = await personByEmail(context, newEmail);
	return clash ? err({ type: "EmailInUse" }) : ok(newEmail);
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
	handler: async (
		context,
		args
	): Promise<{ emailChange: "pending" } | null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(args.phone, PHONE_MAX));
		unwrap(checkLength(args.ventureName, VENTURE_NAME_MAX));
		unwrap(checkLength(args.description, TEXT_MAX));
		unwrap(checkLength(args.whyJoin, TEXT_MAX));
		unwrap(checkLength(args.pastBuilt, TEXT_MAX));
		unwrap(checkLength(args.referral, REFERRAL_MAX));
		const {
			id,
			email,
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
		const person = await context.db.get(id);
		invariant(person, "Person not found");
		const actorId = await currentActorId(context);
		const newEmail = unwrap(
			await resolveEmailChange(context, person, email)
		);

		await applyFieldEdits(context, person, top, actorId);
		const venturePatch = await logVentureEdits(
			context,
			person,
			{
				name: ventureName,
				description,
				whyJoin,
				pastBuilt,
				referral,
				teamSize,
				productStage: nextProductStage,
				fundingStage: nextFundingStage,
			},
			actorId
		);
		await patchVenture(context, person, venturePatch);

		if (newEmail === undefined) return null;
		await context.scheduler.runAfter(
			0,
			internal.people.sendEmailChangeLink,
			{
				personId: id,
				newEmail,
				actorId,
			}
		);
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
	handler: async (context, { personId, newEmail, actorId }) => {
		const token = newConfirmToken();
		const isIssued = await context.runMutation(
			internal.people.issueEmailChangeToken,
			{ personId, newEmail, token, actorId }
		);
		if (!isIssued) return;
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
	handler: async (context, args): Promise<boolean> => {
		if (!(await context.db.get(args.personId))) return false;
		await issueToken(context, {
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
		context,
		{ personId }
	): Promise<{ newEmail: string } | null> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await liveTokens(
			context.db,
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
	handler: async (context, { personId }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		await revokeTokens(context, personId, "emailChange");
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
	handler: async (
		context,
		{ token }
	): Promise<{ status: EmailChangeStatus }> => {
		const redeemed = await redeemRow(
			context,
			await tokenRow(context.db, token),
			"emailChange"
		);
		if (redeemed.status === "invalid") return { status: "invalid" };
		const newEmail = redeemed.row.newEmail;
		const person = await context.db.get(redeemed.row.personId);
		if (!person || newEmail === undefined) return { status: "invalid" };
		if (redeemed.status === "already")
			return {
				status: person.email === newEmail ? "verified" : "invalid",
			};
		if (redeemed.status === "expired") return { status: "expired" };
		const clash = await personByEmail(context, newEmail);
		if (clash && clash._id !== person._id) return { status: "taken" };
		const oldEmail = person.email;
		await logFieldEdit(context, {
			personId: person._id,
			field: "email",
			before: oldEmail,
			after: newEmail,
			actorId: redeemed.row.actorId,
		});
		await context.db.patch(person._id, { email: newEmail });
		await context.scheduler.runAfter(
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
	handler: async (_context, { oldEmail, newEmail }) => {
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
	handler: async (context, args) => {
		// Same gate as `getCurrentPerson`: only a real, entitled access-tier
		// person (guest/member/core/board/admin/staff) — NOT a prospect or former
		// member, whom `entitled` alone does not exclude (see getCurrentRole).
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		unwrap(checkLength(args.phone, PHONE_MAX));
		unwrap(checkLength(args.ventureName, VENTURE_NAME_MAX));
		unwrap(checkLength(args.description, TEXT_MAX));

		const {
			ventureName,
			description,
			teamSize,
			productStage: nextProductStage,
			fundingStage: nextFundingStage,
			links,
			...top
		} = args;
		const actorId = await currentActorId(context);

		await applyFieldEdits(context, person, top, actorId);

		const venturePatch = await logVentureEdits(
			context,
			person,
			{
				name: ventureName,
				description,
				teamSize,
				productStage: nextProductStage,
				fundingStage: nextFundingStage,
			},
			actorId
		);
		if (links !== undefined) {
			venturePatch.links = unwrap(parseSafeLinks(links));
		}

		await patchVenture(context, person, venturePatch);
		await scheduleLinkCheck(context, person._id, links);
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
	handler: async (context, { id, text }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(text, TEXT_MAX));
		const trimmed = text.trim();
		if (trimmed !== "") {
			const person = await context.db.get(id);
			invariant(person, "Person not found");
			const actorId = await currentActorId(context);
			const board = person.board ?? {};
			await context.db.patch(id, {
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
		}
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
	handler: async (context, { id, expiresAt }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(
			await applyEvent(
				context,
				id,
				{ type: "EXTEND_WINDOW", until: expiresAt },
				await currentActorId(context)
			)
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
	handler: async (context, { id, hostedById }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const person = await context.db.get(id);
		invariant(person, "Person not found");
		const actorId = await currentActorId(context);

		const patch: Partial<Doc<"people">> = {};
		if (hostedById !== undefined) {
			patch.hostedById = hostedById ?? undefined;
			// Setting a host id clears the legacy display-name fallback: the id
			// is canonical.
			patch.hostedBy = undefined;
			await logFieldEdit(context, {
				personId: id,
				field: "hostedById",
				before: person.hostedById,
				after: patch.hostedById,
				actorId,
			});
			await logFieldEdit(context, {
				personId: id,
				field: "hostedBy",
				before: person.hostedBy,
				after: undefined,
				actorId,
			});
		}
		await context.db.patch(id, patch);
		return null;
	},
});

/**
 * The signature `getAgreementUrl` would serve for this person: the most recent
 * one. The roster no longer reads signatures (it uses `signedVariants`), so
 * "the button is enabled" and "the click resolves to a document" agree because
 * `insertSignature` rejects rows with neither a `fileId` nor a `sourceUrl`, and
 * this picks the latest signature.
 */
function latestSignature<
	S extends { signedAt: number; fileId?: unknown; sourceUrl?: string },
>(signatures: S[]): S | undefined {
	const latest = signatures.reduce<S | undefined>(
		(accumulator, signature) =>
			accumulator === undefined ||
			signature.signedAt > accumulator.signedAt
				? signature
				: accumulator,
		undefined
	);
	if (latest === undefined) return undefined;
	return latest.fileId === undefined && latest.sourceUrl === undefined
		? undefined
		: latest;
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
 * `hasAgreement` rides along because it comes from `signedVariants` on the
 * person, so there is no per-row signature read. The alternative — every row
 * mounting its own `getAgreementUrl` subscription to decide whether to grey
 * out one button — cost one live query and one signed-URL round trip PER ROW,
 * several hundred of them on first paint. The URL itself is still fetched on
 * click, by the one row the board actually asked about.
 */
/**
 * Read only the people in the given tiers, via the `by_tier_and_formerOf`
 * index, instead of `collect()`-ing the entire table and filtering in memory.
 *
 * The roster lists below are LIVE subscriptions (kept warm at the shell), so they
 * re-run when a row they read changes. Rosters read by tier, former people by
 * `formerOf`, and never touch rows outside their tab, so a write to another
 * tab's row does not re-run them.
 */
export async function peopleByTiers(
	context: QueryCtx,
	tiers: readonly Doc<"people">["tier"][]
): Promise<Doc<"people">[]> {
	const groups = await Promise.all(
		tiers.map((tier) =>
			context.db
				.query("people")
				.withIndex("by_tier_and_formerOf", (range) =>
					range.eq("tier", tier)
				)
				.collect()
		)
	);
	return groups.flat();
}

/** Former people who held one of the given tiers. `undefined` reads former
 *  rows with no `formerOf`. */
async function formerPeople(
	context: QueryCtx,
	formerOf: readonly Doc<"people">["formerOf"][]
): Promise<Doc<"people">[]> {
	const groups = await Promise.all(
		formerOf.map((of) =>
			context.db
				.query("people")
				.withIndex("by_tier_and_formerOf", (range) =>
					range.eq("tier", "former").eq("formerOf", of)
				)
				.collect()
		)
	);
	return groups.flat();
}

export async function withStatus(
	context: QueryCtx,
	rows: Doc<"people">[]
): Promise<PersonRow[]> {
	const now = Date.now();
	return Promise.all(
		rows.map(async (person) => {
			const signedVariants = person.signedVariants ?? [];
			const actorId = person.door?.byId;
			const actor =
				actorId === undefined ? null : await context.db.get(actorId);
			return {
				...person,
				status: personStatus(
					person,
					signedVariants,
					now,
					actor === null ? undefined : displayName(actor)
				),
				hasAgreement: signedVariants.length > 0,
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
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = [
			...(await peopleByTiers(context, ROLE_TIERS)),
			...(await formerPeople(context, [...ROLE_TIERS, undefined])),
		];
		return withStatus(context, rows);
	},
});

// Member-facing board contact directory: active *board* members with their
// names + phone. Admins share board-level permissions but are not on the board,
// so they are intentionally excluded here (filter on `tier === "board"`, NOT
// isBoardLevel). Any signed-in person, staff included, may read it.
export const listBoardContacts = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, ACCESS_TIERS));
		const now = Date.now();
		// `tier === "board"`, NOT isBoardLevel: admins share board-level
		// permissions but are not on the board, and this is the member-facing
		// board directory.
		const people = await peopleByTiers(context, ["board"]);
		return people
			.filter(
				(person) => person.tier === "board" && entitled(person, now)
			)
			.map((person) => ({
				firstName: person.firstName,
				lastName: person.lastName,
				phone: person.phone,
			}));
	},
});

/** The Guests tab: guests at any stage, plus former guests. */
export const listGuests = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = [
			...(await peopleByTiers(context, ["guest"])),
			...(await formerPeople(context, ["guest"])),
		];
		return withStatus(context, rows);
	},
});

// Board + admin with active access. Source for task-assignee and
// project-leader pickers in the Tasks module. Core members may read it (they
// see the Tasks board) but the list itself stays board-level only.
export const listBoardLevel = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, CORE_AND_BOARD));
		const now = Date.now();
		const people = await peopleByTiers(context, BOARD_LEVEL);
		return people
			.filter(
				(person) => isBoardLevel(person.tier) && entitled(person, now)
			)
			.map((person) => boardLevelView(person));
	},
});

/**
 * Revoke access and keep the row. The machine records the tier they held, so
 * re-admitting a kicked core member returns them to core rather than to a
 * generic member, and the reconciler drops their lock authorizations.
 */
export const kickOut = mutation({
	args: { id: v.id("people") },
	handler: async (context, { id }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(
			await applyEvent(
				context,
				id,
				{ type: "KICK_OUT" },
				await currentActorId(context)
			)
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
	handler: async (context, { id }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(
			await applyEvent(
				context,
				id,
				{ type: "PROMOTE_TO_MEMBER" },
				await currentActorId(context)
			)
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
	handler: async (context, { personId, stepId }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		invariant(
			BOARD_STEPS.some((step) => step.id === stepId),
			`Unknown board step: ${stepId}`
		);
		const person = await context.db.get(personId);
		invariant(person, "Person not found");
		const actorId = await currentActorId(context);
		const boardSteps = {
			...(person.onboarding?.boardSteps ?? {}),
			[stepId]: { completedAt: Date.now(), byId: actorId },
		};
		await context.db.patch(personId, {
			onboarding: { ...(person.onboarding ?? { steps: {} }), boardSteps },
		});
		await context.db.insert("personEvents", {
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
		context,
		{ stepId, emails }
	): Promise<{
		marked: string[];
		alreadyDone: string[];
		unknown: string[];
	}> => {
		invariant(
			BOARD_STEPS.some((step) => step.id === stepId),
			`Unknown board step: ${stepId}`
		);
		const result = {
			marked: [] as string[],
			alreadyDone: [] as string[],
			unknown: [] as string[],
		};
		const now = Date.now();
		for (const email of emails) {
			const person = await personByEmail(context, email);
			if (!person) {
				result.unknown.push(email);
				continue;
			}
			const done = person.onboarding?.boardSteps ?? {};
			if (stepId in done) {
				result.alreadyDone.push(email);
				continue;
			}
			await context.db.patch(person._id, {
				onboarding: {
					...(person.onboarding ?? { steps: {} }),
					boardSteps: { ...done, [stepId]: { completedAt: now } },
				},
			});
			await context.db.insert("personEvents", {
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

/** Clear one person's board step and the timeline row it wrote, unless a board
 *  member ticked it themselves. */
async function unmarkBoardStep(
	context: MutationCtx,
	person: Doc<"people">,
	stepId: string
): Promise<"unmarked" | "notDone" | "keptByBoard"> {
	const done = person.onboarding?.boardSteps ?? {};
	if (!(stepId in done)) return "notDone";
	if (done[stepId].byId) return "keptByBoard";
	await context.db.patch(person._id, {
		onboarding: {
			...(person.onboarding ?? { steps: {} }),
			boardSteps: Object.fromEntries(
				Object.entries(done).filter(([id]) => id !== stepId)
			),
		},
	});
	const events = await context.db
		.query("personEvents")
		.withIndex("by_person", (range) => range.eq("personId", person._id))
		.collect();
	for (const event of events)
		if (
			event.kind === "board_task" &&
			event.meta === stepId &&
			event.actorId === undefined
		)
			await context.db.delete(event._id);
	return "unmarked";
}

/**
 * Undo {@link markBoardStepDone} for these people: clear the step and the
 * timeline row it wrote, so the board task is open again. Only a tick with no
 * actor — one made from the CLI — is cleared; a board member's own tick from
 * the drawer is left alone and reported as `keptByBoard`.
 */
export const unmarkBoardStepDone = internalMutation({
	args: { stepId: v.string(), emails: v.array(v.string()) },
	handler: async (
		context,
		{ stepId, emails }
	): Promise<{
		unmarked: string[];
		notDone: string[];
		keptByBoard: string[];
		unknown: string[];
	}> => {
		invariant(
			BOARD_STEPS.some((step) => step.id === stepId),
			`Unknown board step: ${stepId}`
		);
		const result = {
			unmarked: [] as string[],
			notDone: [] as string[],
			keptByBoard: [] as string[],
			unknown: [] as string[],
		};
		for (const email of emails) {
			const person = await personByEmail(context, email);
			if (!person) {
				result.unknown.push(email);
				continue;
			}
			const outcome = await unmarkBoardStep(context, person, stepId);
			result[outcome].push(email);
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
	handler: async (context) => {
		const person = unwrap(await requireRole(context, ACCESS_TIERS));
		const events = await context.db
			.query("personEvents")
			.withIndex("by_person", (range) => range.eq("personId", person._id))
			.collect();
		if (events.some((event) => event.kind === "wifi")) return;
		await context.db.insert("personEvents", {
			personId: person._id,
			at: Date.now(),
			actorId: person._id,
			kind: "wifi",
		});
	},
});

// Board-gated: latest signed-agreement URL for a person. In-app signatures
// store a PDF in _storage (`fileId`); legacy Notion imports carry only a
// `sourceUrl`. Returns null when the person has no signature on file.
export const getAgreementUrl = query({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const sigs = await context.db
			.query("signatures")
			.withIndex("by_person", (range) => range.eq("personId", personId))
			.collect();
		const latest = latestSignature(sigs);
		if (!latest) return null;
		return latest.fileId
			? await context.storage.getUrl(latest.fileId)
			: (latest.sourceUrl ?? null);
	},
});

// Board-gated: the events a person attended, for the "Came from" line in the
// drawer. Joins `eventAttendance` (`by_person`) to `events`; an attendance row
// whose event was since deleted is skipped rather than surfaced as a broken
// reference.
export const attendedEvents = query({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const rows = await context.db
			.query("eventAttendance")
			.withIndex("by_person", (range) => range.eq("personId", personId))
			.collect();
		const out: {
			eventId: Id<"events">;
			name: string;
			confirmedAt: number;
		}[] = [];
		for (const row of rows) {
			const event = await context.db.get(row.eventId);
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
