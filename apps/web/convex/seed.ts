import { v } from "convex/values";
import type { Infer } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { DAY_MS } from "./lib/constants.ts";
import { developmentAdminEmail } from "./lib/devAdmin.ts";
import { normalizeEmail, personByEmail } from "./lib/emailAddress.ts";
import { insertSignature } from "./lib/signatures.ts";
import type { vertical } from "./schema.ts";

type Vertical = Infer<typeof vertical>;

type SeedEntry = {
	name: string;
	email: string;
	vertical: Vertical[];
	ventureName: string;
	productStage: "building" | "prototype" | "mvp" | "traction" | "other";
	fundingStage:
		| "bootstrapped"
		| "angel"
		| "pre_seed"
		| "seed"
		| "series_a"
		| "other";
	links?: { label: string; url: string }[];
	/** The board's shared score. */
	score?: number;
	/** Where a PROSPECT sits, for entries with no `person` block. */
	stage?: "unverified" | "verified" | "queued" | "denied";
	/** When `stage` is `"denied"`: days from now (negative = in the past) of the
	 *  denial. Drives the six-month reapply debounce (`REAPPLY_DEBOUNCE_MS`) —
	 *  without it, a fresh sign-up reusing the email skips the debounce
	 *  entirely, since `reapplyDecision` only applies it when `deniedAt != null`. */
	deniedAtDays?: number;
	/** Present when this person has an access tier. The access bounds are days
	 *  from now (negative = in the past). */
	person?: {
		tier: "guest" | "member" | "core" | "former";
		stage: "onboarding" | "active" | "expired";
		formerOf?: NonNullable<Doc<"people">["formerOf"]>;
		formerReason?: "kicked" | "left";
		accessFromDays?: number;
		accessUntilDays?: number;
	};
	/**
	 * Has this person signed the agreement their tier requires? Most have — the
	 * Flags column is meant to be EMPTY for a settled person, so a fixture where
	 * everyone is missing an agreement makes the console look broken and hides
	 * whether the other flags work at all.
	 */
	signed?: boolean;
	/**
	 * A board door override. `force_off` and `force_on` are the only way to see
	 * the two door flags, and neither arises from normal seeding.
	 */
	door?: { override: "force_on" | "force_off"; reason?: string };
	/** Days ago this person entered their current state; drives "State since". */
	stageAgeDays?: number;
};

const SEED_ENTRIES: SeedEntry[] = [
	// --- members (5): mix confirmed/approved -------------------------------
	{
		name: "Marie Curie",
		email: "marie@jfloor.test",
		vertical: ["healthtech"],
		ventureName: "Radium Labs",
		productStage: "traction",
		fundingStage: "seed",
		links: [
			{ label: "Website", url: "https://radiumlabs.test" },
			{
				label: "LinkedIn",
				url: "https://linkedin.com/in/mcurie",
			},
		],
		score: 9,
		person: {
			tier: "member",
			stage: "active",
			accessFromDays: -30,
			accessUntilDays: 90,
		},
		signed: true,
		stageAgeDays: 412,
	},
	{
		name: "Nikola Tesla",
		email: "nikola@jfloor.test",
		vertical: ["climate"],
		ventureName: "Wardenclyffe",
		productStage: "mvp",
		fundingStage: "pre_seed",
		score: 8,
		person: {
			tier: "member",
			stage: "active",
			accessFromDays: -60,
			accessUntilDays: 30,
		},
		signed: true,
		stageAgeDays: 96,
		// Exercises the "Door access blocked by …" flag.
		door: { override: "force_off", reason: "Unpaid dues" },
	},
	{
		// Core member: same as a member but also sees the Tasks module.
		name: "Katherine Johnson",
		email: "katherine@jfloor.test",
		vertical: ["aerospace"],
		ventureName: "Orbit Mechanics",
		productStage: "traction",
		fundingStage: "bootstrapped",
		score: 9,
		person: {
			tier: "core",
			stage: "active",
			accessFromDays: -10,
			accessUntilDays: 120,
		},
		signed: true,
		stageAgeDays: 1,
	},
	{
		name: "Linus Torvalds",
		email: "linus@jfloor.test",
		vertical: ["devtools"],
		ventureName: "Kernel Co",
		productStage: "mvp",
		fundingStage: "bootstrapped",
		score: 7,
		person: { tier: "member", stage: "onboarding" }, // approved, not yet confirmed -> no access window
		stageAgeDays: 34,
	},
	{
		name: "Margaret Hamilton",
		email: "margaret@jfloor.test",
		vertical: ["aerospace"],
		ventureName: "Apollo Guidance",
		productStage: "traction",
		fundingStage: "seed",
		score: 9,
		person: {
			tier: "member",
			stage: "onboarding",
			accessFromDays: 7,
			accessUntilDays: 100,
		},
		signed: true,
		stageAgeDays: 3,
		// Exercises "Door access always on (…)": her window has not
		// opened yet, so without the override she would not be let in.
		door: { override: "force_on", reason: "Starting early" },
	},

	// --- guests (4): mix confirmed/approved, one expired -------------------
	{
		name: "Tim Berners-Lee",
		email: "tim@jfloor.test",
		vertical: ["consumer"],
		ventureName: "WorldWideWeb",
		productStage: "mvp",
		fundingStage: "bootstrapped",
		score: 8,
		person: {
			tier: "guest",
			stage: "active",
			accessFromDays: -5,
			accessUntilDays: 25,
		},
		signed: true,
		stageAgeDays: 5,
	},
	{
		name: "Radia Perlman",
		email: "radia@jfloor.test",
		vertical: ["infra"],
		ventureName: "Spanning Tree",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		score: 7,
		person: {
			tier: "guest",
			stage: "expired", // EXPIRED
			accessFromDays: -40,
			accessUntilDays: -2,
		},
		signed: true,
		stageAgeDays: 2,
	},
	{
		name: "Vint Cerf",
		email: "vint@jfloor.test",
		vertical: ["infra"],
		ventureName: "TCP Ventures",
		productStage: "mvp",
		fundingStage: "bootstrapped",
		score: 8,
		person: { tier: "guest", stage: "onboarding" }, // approved, not confirmed -> no window
		stageAgeDays: 11,
	},
	{
		name: "Barbara Liskov",
		email: "barbara@jfloor.test",
		vertical: ["devtools"],
		ventureName: "Substitution Inc",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		score: 9,
		person: { tier: "guest", stage: "onboarding" },
		signed: true,
		stageAgeDays: 60,
	},

	// --- prospects (2): denied/pending, no access tier ----------------------
	{
		name: "Dennis Ritchie",
		email: "dennis@jfloor.test",
		vertical: ["devtools"],
		ventureName: "C Systems",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		score: 4,
		stage: "denied",
		deniedAtDays: -60,
	},
	{
		name: "Ken Thompson",
		email: "ken@jfloor.test",
		vertical: ["devtools"],
		ventureName: "Unix Labs",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		links: [
			{ label: "GitHub", url: "https://github.com/ken" },
			{ label: "Site", url: "https://unixlabs.test" },
		],
		stage: "verified",
	},
	// kicked-out ex-member: demoted to `former` but flagged, so the
	// Members tab keeps them in the "Kicked out" group (data retained).
	{
		name: "Seymour Cray",
		email: "seymour@jfloor.test",
		vertical: ["hardware"],
		ventureName: "Supercompute Co",
		productStage: "traction",
		fundingStage: "seed",
		score: 8,
		person: {
			tier: "former",
			stage: "active",
			formerOf: "member",
			formerReason: "kicked",
		},
		signed: true,
		stageAgeDays: 220,
	},

	{
		name: "Hopper Grace",
		email: "hopper@jfloor.test",
		vertical: ["devtools"],
		ventureName: "Compiler Works",
		productStage: "traction",
		fundingStage: "angel",
		score: 8,
		person: {
			tier: "former",
			stage: "active",
			formerOf: "member",
			// Exercises "Left voluntarily" — the flag that exists because
			// both tabs file resignations under a "Kicked out" heading.
			formerReason: "left",
		},
		signed: true,
		stageAgeDays: 75,
	},

	// --- pending inbox (3): prospects awaiting triage, no person tier -------
	{
		name: "Hedy Lamarr",
		email: "hedy@jfloor.test",
		vertical: ["infra"],
		ventureName: "Frequency Hop",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		stage: "verified",
	},
	{
		name: "John von Neumann",
		email: "john@jfloor.test",
		vertical: ["ai"],
		ventureName: "Stored Program",
		productStage: "mvp",
		fundingStage: "bootstrapped",
		score: 6, // partially scored
		stage: "queued",
	},
	{
		name: "Claude Shannon",
		email: "claude@jfloor.test",
		vertical: ["ai"],
		ventureName: "Information Theory Co",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		stage: "verified",
	},

	// --- denied (2): prospects, no person tier ------------------------------
	{
		name: "Charles Babbage",
		email: "charles@jfloor.test",
		vertical: ["hardware"],
		ventureName: "Difference Engine",
		productStage: "prototype",
		fundingStage: "bootstrapped",
		score: 3,
		stage: "denied",
		deniedAtDays: -45,
	},
	{
		name: "Joan Clarke",
		email: "joan@jfloor.test",
		vertical: ["security"],
		ventureName: "Cipher Works",
		productStage: "mvp",
		fundingStage: "bootstrapped",
		score: 5,
		stage: "denied",
		deniedAtDays: -20,
	},
];

const INVENTORY_TABLES = ["items", "itemTypes", "itemCategories"] as const;

async function wipeInventory(context: MutationCtx): Promise<void> {
	for (const table of INVENTORY_TABLES) {
		const rows = await context.db.query(table).collect();
		for (const row of rows) await context.db.delete(row._id);
	}
}

async function seedInventory(context: MutationCtx): Promise<void> {
	const furniture = await context.db.insert("itemCategories", {
		name: "Furniture",
		description: "Desks, chairs, and shared seating.",
	});
	const kitchen = await context.db.insert("itemCategories", {
		name: "Kitchen",
		description: "Shared appliances and tableware.",
	});
	const av = await context.db.insert("itemCategories", {
		name: "AV",
		description: "Screens, speakers, and cables.",
	});

	const chair = await context.db.insert("itemTypes", {
		name: "Chair",
		categoryId: furniture,
		description: "Task or lounge chair.",
	});
	const desk = await context.db.insert("itemTypes", {
		name: "Desk",
		categoryId: furniture,
	});
	const kettle = await context.db.insert("itemTypes", {
		name: "Kettle",
		categoryId: kitchen,
	});
	const projector = await context.db.insert("itemTypes", {
		name: "Projector",
		categoryId: av,
		description: "Meeting-room projector.",
	});

	await context.db.insert("items", {
		typeId: chair,
		assetTag: "F00001",
		description: "By the window",
	});
	await context.db.insert("items", { typeId: chair, assetTag: "F00002" });
	await context.db.insert("items", { typeId: desk, assetTag: "F00010" });
	await context.db.insert("items", { typeId: kettle, assetTag: "K00001" });
	await context.db.insert("items", {
		typeId: projector,
		assetTag: "A00001",
		description: "Main space",
	});
}

const DEV_WIFI = { ssid: "J floor (dev)", password: "dev-wifi-password" };

/**
 * Idempotent: only inserts when the `wifiConfig` singleton is absent, so a
 * board edit made against a dev deployment survives a reseed instead of being
 * clobbered back to the fixture value.
 */
async function seedWifi(context: MutationCtx): Promise<void> {
	const existing = await context.db.query("wifiConfig").first();
	if (existing) return;
	await context.db.insert("wifiConfig", DEV_WIFI);
}

// Dev-only fixtures. Run with `bunx convex run seed:run` against your personal
// dev deployment (never prod). Deterministic on purpose: re-running resets the
// people table to the exact same fake users, so the UI always renders from a
// known state. To wipe without reseeding: `bunx convex run seed:clearAll`.

const SUBMISSION_SPACING_DAYS = 3;

const MEMBER_TESTER_ACCESS_DAYS = 90;

function offsetByDays(
	now: number,
	days: number | undefined
): number | undefined {
	return days === undefined ? undefined : now + days * DAY_MS;
}

const WIPED_TABLES = [
	"signatures",
	"personEvents",
	"purgeLog",
	"personState",
	"people",
] as const;

async function wipeSeededData(context: MutationCtx): Promise<void> {
	await wipeInventory(context);
	for (const table of WIPED_TABLES) {
		const rows = await context.db.query(table).collect();
		for (const row of rows) await context.db.delete(row._id);
	}
}

export const clearAll = internalMutation({
	args: {},
	handler: async (context) => {
		await wipeSeededData(context);
	},
});

/**
 * Board members — standalone, no application. The address in
 * `DEV_ADMIN_EMAIL` (default `admin@example.com`) survives reseeds without a
 * manual `addDirect`; an extra `boardEmail` arg can grant a second account
 * board access.
 */
async function seedBoard(
	context: MutationCtx,
	extraBoardEmail: string | undefined,
	now: number
): Promise<Id<"people">[]> {
	const board = [
		{ email: developmentAdminEmail(), name: "J Floor Admin" },
		{ email: "ada@jfloor.test", name: "Ada Lovelace" },
		{ email: "grace@jfloor.test", name: "Grace Hopper" },
		{ email: "alan@jfloor.test", name: "Alan Turing" },
	];
	const boardEmail =
		extraBoardEmail === undefined
			? undefined
			: normalizeEmail(extraBoardEmail);
	if (boardEmail && !board.some((member) => member.email === boardEmail))
		board.push({ email: boardEmail, name: "Board Admin" });
	const boardIds: Id<"people">[] = [];
	for (const member of board) {
		const [firstName, ...lastParts] = member.name.split(" ");
		boardIds.push(
			await context.db.insert("people", {
				email: normalizeEmail(member.email),
				firstName,
				lastName: lastParts.join(" "),
				tier: "board",
				stage: "active",
				stageSince: now,
				provenance: "seed",
				door: { override: "none" },
			})
		);
	}
	return boardIds;
}

const ONE_SECOND = 1000;

type SignedVariant = "guest" | "member" | null;

/** How many days before the person's current state each history row sits. */
const DAYS_BEFORE_STAGE = {
	signUp: 30,
	verify: 29,
	scored: 20,
	approved: 10,
	document: 5,
	boardTask: 4,
	fieldEdit: 2,
};

type HistoryKind =
	| "transition"
	| "field_edit"
	| "board_task"
	| "step"
	| "door"
	| "email";

type HistoryRow = {
	at: number;
	kind: HistoryKind;
	event?: string;
	from?: string;
	to?: string;
	field?: string;
	before?: unknown;
	after?: unknown;
	meta?: unknown;
	actorId?: Id<"people">;
};

type HistoryContext = {
	actorId: Id<"people"> | undefined;
	entry: SeedEntry;
	stageSince: number;
};

function daysBefore(stageSince: number, days: number): number {
	return stageSince - days * DAY_MS;
}

function signUpRows({
	actorId,
	entry,
	stageSince,
}: HistoryContext): HistoryRow[] {
	// Everyone applied and was verified.
	const rows: HistoryRow[] = [
		{
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.signUp),
			kind: "transition",
			event: "SIGN_UP",
			to: "prospect.unverified",
		},
		{
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.verify),
			kind: "transition",
			event: "VERIFY_EMAIL",
			from: "prospect.unverified",
			to: "prospect.verified",
		},
	];
	if (entry.score !== undefined)
		rows.push({
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.scored),
			kind: "transition",
			event: "SET_SCORE",
			to: "prospect.queued",
			actorId,
		});
	return rows;
}

function approvalRows({
	actorId,
	entry,
	stageSince,
}: HistoryContext): HistoryRow[] {
	const tier = entry.person?.tier;
	if (tier === undefined) return [];
	const approved = tier === "guest" ? "APPROVE_GUEST" : "APPROVE_MEMBER";
	const approvedAt = daysBefore(stageSince, DAYS_BEFORE_STAGE.approved);
	return [
		{
			at: approvedAt,
			kind: "transition",
			event: approved,
			from: "prospect.queued",
			to: `${tier === "former" ? "member" : tier}.onboarding`,
			actorId,
		},
		{ at: approvedAt + ONE_SECOND, kind: "email", meta: "approval" },
	];
}

function signedRows(
	{ actorId, stageSince }: HistoryContext,
	signedVariant: SignedVariant
): HistoryRow[] {
	if (signedVariant === null) return [];
	return [
		{
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.document),
			kind: "step",
			meta: "document",
		},
		{
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.boardTask),
			kind: "board_task",
			meta: "Add to WhatsApp group",
			actorId,
		},
	];
}

function doorRows({
	actorId,
	entry,
	stageSince,
}: HistoryContext): HistoryRow[] {
	if (!entry.door) return [];
	return [
		{
			at: stageSince + ONE_SECOND,
			kind: "door",
			after: entry.door.override,
			meta: entry.door.reason,
			actorId,
		},
	];
}

function formerRows({
	actorId,
	entry,
	stageSince,
}: HistoryContext): HistoryRow[] {
	if (entry.person?.tier !== "former") return [];
	return [
		{
			at: stageSince,
			kind: "transition",
			event:
				entry.person.formerReason === "left" ? "MARK_LEFT" : "KICK_OUT",
			to: "former.active",
			actorId,
		},
	];
}

/**
 * A plausible audit trail for one seeded person, so the sheet's History
 * section has something to render.
 *
 * Without this every seeded row's History is empty, which makes the section
 * look broken and means nothing exercises `PersonTimeline`'s kind mapping,
 * its actor attribution or its collapsed field edits. Entries are written
 * oldest-first with real gaps between them.
 */
async function seedHistory(
	context: MutationCtx,
	args: {
		personId: Id<"people">;
		actorId: Id<"people"> | undefined;
		entry: SeedEntry;
		stageSince: number;
		signedVariant: SignedVariant;
	}
): Promise<void> {
	const { personId, actorId, entry, stageSince } = args;
	const history = { actorId, entry, stageSince };
	const rows: HistoryRow[] = [
		...signUpRows(history),
		...approvalRows(history),
		...signedRows(history, args.signedVariant),
		...doorRows(history),
		...formerRows(history),
		// One field edit, so the timeline's collapsed-by-default kind is populated.
		{
			at: daysBefore(stageSince, DAYS_BEFORE_STAGE.fieldEdit),
			kind: "field_edit",
			field: "phone",
			before: undefined,
			after: "+1 555 0100",
			actorId,
		},
	];

	for (const row of rows)
		await context.db.insert("personEvents", { personId, ...row });
}

/** The agreement an entry's CURRENT tier requires, if any. */
function agreementVariantOf(entry: SeedEntry): SignedVariant {
	const tier = entry.person?.tier;
	if (tier === "guest") return "guest";
	const isMemberLike =
		tier === "member" ||
		tier === "core" ||
		entry.person?.formerOf === "member";
	return isMemberLike ? "member" : null;
}

function accessWindowOf(
	entry: SeedEntry,
	now: number
): { accessFrom: number | undefined; accessUntil: number | undefined } {
	return {
		accessFrom: offsetByDays(now, entry.person?.accessFromDays),
		accessUntil: offsetByDays(now, entry.person?.accessUntilDays),
	};
}

function doorOf(
	entry: SeedEntry,
	now: number,
	actorId: Id<"people"> | undefined
) {
	if (!entry.door) return { override: "none" as const };
	return {
		override: entry.door.override,
		reason: entry.door.reason,
		byId: actorId,
		at: now - DAY_MS,
	};
}

function ventureOf(entry: SeedEntry) {
	return {
		name: entry.ventureName,
		productStage: entry.productStage,
		fundingStage: entry.fundingStage,
		links: entry.links,
		// Synthesised exactly as the old applications insert did.
		description: `${entry.ventureName} — building in ${entry.vertical.join(", ")}.`,
		whyJoin: `Joining J Floor to grow ${entry.ventureName}.`,
	};
}

type EntryPlacement = {
	entry: SeedEntry;
	index: number;
	now: number;
	actorId: Id<"people"> | undefined;
	stageSince: number;
};

function personRowOf({
	entry,
	index,
	now,
	actorId,
	stageSince,
}: EntryPlacement) {
	const [firstName, ...lastParts] = entry.name.split(" ");
	return {
		email: normalizeEmail(entry.email),
		firstName,
		lastName: lastParts.join(" "),
		tier: entry.person?.tier ?? ("prospect" as const),
		stage: entry.person?.stage ?? entry.stage ?? ("verified" as const),
		formerOf: entry.person?.formerOf,
		formerReason: entry.person?.formerReason,
		stageSince,
		provenance: "seed" as const,
		door: doorOf(entry, now, actorId),
		...accessWindowOf(entry, now),
		deniedAt: offsetByDays(now, entry.deniedAtDays),
		vertical: entry.vertical,
		venture: ventureOf(entry),
		// ONE shared score now, not one per board member: `toScores` and its
		// `{ boardMemberId, value }[]` shape die with the applications table.
		board: { score: entry.score },
		// Spread submission dates a few days apart (deterministic) so the
		// Date column and the date sort have something to show.
		submittedAt: now - index * SUBMISSION_SPACING_DAYS * DAY_MS,
		verifiedAt: now,
	};
}

async function seedEntry(
	context: MutationCtx,
	{ entry, index, now, actorId }: Omit<EntryPlacement, "stageSince">
): Promise<void> {
	// Staggered so "State since" reads differently down the list instead of
	// "Today" on every row.
	const stageSince = now - (entry.stageAgeDays ?? index) * DAY_MS;
	const personId = await context.db.insert(
		"people",
		personRowOf({ entry, index, now, actorId, stageSince })
	);

	// The agreement their CURRENT tier requires. Without this every
	// member and guest carries an "agreement not signed" flag, which is
	// both wrong and hides whether any other flag renders.
	const variant = agreementVariantOf(entry);
	if (entry.signed && variant !== null) {
		await insertSignature(context, {
			personId,
			email: normalizeEmail(entry.email),
			variant,
			signedName: entry.name,
			agreementVersion: "1",
			agreementHash: `seed-${entry.email}`,
			signedAt: stageSince,
			sourceUrl: "https://example.test/seed-agreement.pdf",
		});
	}

	await seedHistory(context, {
		personId,
		actorId,
		entry,
		stageSince,
		signedVariant: entry.signed ? variant : null,
	});
}

/**
 * Optional real member account (magic-link-reachable) for testing the
 * member-facing directory view. Upsert so reseeds keep it a member. Returns
 * whether a new row was created.
 */
async function didCreateMemberTester(
	context: MutationCtx,
	memberEmailArgument: string | undefined,
	now: number
): Promise<boolean> {
	if (!memberEmailArgument) return false;
	const memberEmail = normalizeEmail(memberEmailArgument);
	const existing = await personByEmail(context, memberEmail);
	const profile = {
		firstName: "Member",
		lastName: "Tester",
		tier: "member" as const,
		stage: "active" as const,
		stageSince: now,
		provenance: "seed" as const,
		door: { override: "none" as const },
		accessFrom: now - DAY_MS,
		accessUntil: now + MEMBER_TESTER_ACCESS_DAYS * DAY_MS,
	};
	if (existing) await context.db.patch(existing._id, profile);
	else await context.db.insert("people", { email: memberEmail, ...profile });
	return !existing;
}

export const run = internalMutation({
	// Optional real (magic-link-reachable) accounts to provision for manual
	// testing: `boardEmail` gets the full board console, `memberEmail` gets the
	// read-only member directory view. e.g.
	// `bunx convex run seed:run '{"boardEmail":"me@example.com","memberEmail":"me+m@example.com"}'`.
	args: {
		boardEmail: v.optional(v.string()),
		memberEmail: v.optional(v.string()),
	},
	handler: async (context, args) => {
		// idempotent reseed
		await wipeSeededData(context);

		const now = Date.now();
		const boardIds = await seedBoard(context, args.boardEmail, now);

		// One board member owns every seeded override and audit entry, so the
		// sheet shows a name rather than degrading to "the board".
		const actorId = boardIds[1] ?? boardIds[0];

		// Everyone who went through an application.
		for (let index = 0; index < SEED_ENTRIES.length; index++)
			await seedEntry(context, {
				entry: SEED_ENTRIES[index],
				index,
				now,
				actorId,
			});

		const isMemberProvisioned = await didCreateMemberTester(
			context,
			args.memberEmail,
			now
		);

		await seedInventory(context);
		await seedWifi(context);

		return {
			board: boardIds.length,
			people:
				boardIds.length +
				SEED_ENTRIES.length +
				(isMemberProvisioned ? 1 : 0),
		};
	},
});
