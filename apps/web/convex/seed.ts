import { v } from "convex/values";
import type { Infer } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { devAdminEmail } from "./lib/devAdmin.ts";
import { normalizeEmail, personByEmail } from "./lib/emailAddress.ts";
import type { vertical } from "./schema.ts";

const INVENTORY_TABLES = ["items", "itemTypes", "itemCategories"] as const;

async function wipeInventory(ctx: MutationCtx): Promise<void> {
	for (const table of INVENTORY_TABLES) {
		for (const row of await ctx.db.query(table).collect())
			await ctx.db.delete(row._id);
	}
}

async function seedInventory(ctx: MutationCtx): Promise<void> {
	const furniture = await ctx.db.insert("itemCategories", {
		name: "Furniture",
		description: "Desks, chairs, and shared seating.",
	});
	const kitchen = await ctx.db.insert("itemCategories", {
		name: "Kitchen",
		description: "Shared appliances and tableware.",
	});
	const av = await ctx.db.insert("itemCategories", {
		name: "AV",
		description: "Screens, speakers, and cables.",
	});

	const chair = await ctx.db.insert("itemTypes", {
		name: "Chair",
		categoryId: furniture,
		description: "Task or lounge chair.",
	});
	const desk = await ctx.db.insert("itemTypes", {
		name: "Desk",
		categoryId: furniture,
	});
	const kettle = await ctx.db.insert("itemTypes", {
		name: "Kettle",
		categoryId: kitchen,
	});
	const projector = await ctx.db.insert("itemTypes", {
		name: "Projector",
		categoryId: av,
		description: "Meeting-room projector.",
	});

	await ctx.db.insert("items", {
		typeId: chair,
		assetTag: "F00001",
		description: "By the window",
	});
	await ctx.db.insert("items", { typeId: chair, assetTag: "F00002" });
	await ctx.db.insert("items", { typeId: desk, assetTag: "F00010" });
	await ctx.db.insert("items", { typeId: kettle, assetTag: "K00001" });
	await ctx.db.insert("items", {
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
async function seedWifi(ctx: MutationCtx): Promise<void> {
	const existing = await ctx.db.query("wifiConfig").first();
	if (existing) return;
	await ctx.db.insert("wifiConfig", DEV_WIFI);
}

type Vertical = Infer<typeof vertical>;

// Dev-only fixtures. Run with `bunx convex run seed:run` against your personal
// dev deployment (never prod). Deterministic on purpose: re-running resets the
// people table to the exact same fake users, so the UI always renders from a
// known state. To wipe without reseeding: `bunx convex run seed:clearAll`.

const DAY = 24 * 60 * 60 * 1000;

type Entry = {
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
	scores?: number[]; // one value per board member, in order
	/** Where a PROSPECT sits, for entries with no `person` block. */
	stage?: "unverified" | "verified" | "queued" | "denied";
	/** When `stage` is `"denied"`: drives the six-month reapply debounce
	 *  (`REAPPLY_DEBOUNCE_MS`) — without it, a fresh sign-up reusing the email
	 *  skips the debounce entirely, since `reapplyDecision` only applies it
	 *  when `deniedAt != null`. */
	deniedAt?: number;
	/** Present when this person has an access tier. */
	person?: {
		tier: "guest" | "member" | "core" | "former";
		stage: "onboarding" | "active" | "expired";
		formerOf?: Doc<"people">["formerOf"];
		formerReason?: "kicked" | "left";
		accessFrom?: number;
		accessUntil?: number;
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

/**
 * A plausible audit trail for one seeded person, so the drawer's History
 * section has something to render.
 *
 * Without this every seeded row's History is empty, which makes the section
 * look broken and means nothing exercises `PersonTimeline`'s kind mapping,
 * its actor attribution or its collapsed field edits. Entries are written
 * oldest-first with real gaps between them.
 */
async function seedHistory(
	ctx: MutationCtx,
	args: {
		personId: Id<"people">;
		actorId: Id<"people"> | undefined;
		entry: Entry;
		stageSince: number;
		signedVariant: "guest" | "member" | null;
	}
): Promise<void> {
	const { personId, actorId, entry, stageSince } = args;
	const tier = entry.person?.tier;
	const rows: {
		at: number;
		kind:
			| "transition"
			| "field_edit"
			| "board_task"
			| "step"
			| "door"
			| "email";
		event?: string;
		from?: string;
		to?: string;
		field?: string;
		before?: unknown;
		after?: unknown;
		meta?: unknown;
		actorId?: Id<"people">;
	}[] = [];

	// Everyone applied and was verified.
	rows.push({
		at: stageSince - 30 * DAY,
		kind: "transition",
		event: "SIGN_UP",
		to: "prospect.unverified",
	});
	rows.push({
		at: stageSince - 29 * DAY,
		kind: "transition",
		event: "VERIFY_EMAIL",
		from: "prospect.unverified",
		to: "prospect.verified",
	});
	if (entry.scores?.[0] !== undefined)
		rows.push({
			at: stageSince - 20 * DAY,
			kind: "transition",
			event: "SET_SCORE",
			to: "prospect.queued",
			actorId,
		});

	if (tier !== undefined) {
		const approved = tier === "guest" ? "APPROVE_GUEST" : "APPROVE_MEMBER";
		rows.push({
			at: stageSince - 10 * DAY,
			kind: "transition",
			event: approved,
			from: "prospect.queued",
			to: `${tier === "former" ? "member" : tier}.onboarding`,
			actorId,
		});
		rows.push({
			at: stageSince - 10 * DAY + 1000,
			kind: "email",
			meta: "approval",
		});
	}

	if (args.signedVariant !== null) {
		rows.push({
			at: stageSince - 5 * DAY,
			kind: "step",
			meta: "document",
		});
		rows.push({
			at: stageSince - 4 * DAY,
			kind: "board_task",
			meta: "Add to WhatsApp group",
			actorId,
		});
	}

	if (entry.door)
		rows.push({
			at: stageSince + 1000,
			kind: "door",
			after: entry.door.override,
			meta: entry.door.reason,
			actorId,
		});

	if (tier === "former")
		rows.push({
			at: stageSince,
			kind: "transition",
			event:
				entry.person?.formerReason === "left"
					? "MARK_LEFT"
					: "KICK_OUT",
			to: "former.active",
			actorId,
		});

	// One field edit, so the timeline's collapsed-by-default kind is populated.
	rows.push({
		at: stageSince - 2 * DAY,
		kind: "field_edit",
		field: "phone",
		before: undefined,
		after: "+1 555 0100",
		actorId,
	});

	for (const row of rows)
		await ctx.db.insert("personEvents", { personId, ...row });
}

export const clearAll = internalMutation({
	args: {},
	handler: async (ctx) => {
		await wipeInventory(ctx);
		for (const table of [
			"signatures",
			"personEvents",
			"purgeLog",
			"people",
		] as const) {
			for (const row of await ctx.db.query(table).collect())
				await ctx.db.delete(row._id);
		}
	},
});

export const run = internalMutation({
	// Optional real (magic-link-reachable) accounts to provision for manual
	// testing: `boardEmail` gets the full board console, `memberEmail` gets the
	// read-only member directory view. e.g.
	// `bunx convex run seed:run '{"boardEmail":"me@example.com","memberEmail":"me+m@example.com"}'`.
	args: {
		boardEmail: v.optional(v.string()),
		memberEmail: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// idempotent reseed
		await wipeInventory(ctx);
		for (const table of [
			"signatures",
			"personEvents",
			"purgeLog",
			"people",
		] as const) {
			for (const row of await ctx.db.query(table).collect())
				await ctx.db.delete(row._id);
		}

		const now = Date.now();

		// 1. board members — standalone, no application. The address in
		// `DEV_ADMIN_EMAIL` (default `admin@example.com`) survives reseeds
		// without a manual `addDirect`; an extra `boardEmail` arg can grant a
		// second account board access.
		const board = [
			{ email: devAdminEmail(), name: "J Floor Admin" },
			{ email: "ada@jfloor.test", name: "Ada Lovelace" },
			{ email: "grace@jfloor.test", name: "Grace Hopper" },
			{ email: "alan@jfloor.test", name: "Alan Turing" },
		];
		const boardEmail =
			args.boardEmail === undefined
				? undefined
				: normalizeEmail(args.boardEmail);
		if (boardEmail && !board.some((b) => b.email === boardEmail))
			board.push({ email: boardEmail, name: "Board Admin" });
		const boardIds: Id<"people">[] = [];
		for (const b of board) {
			const [firstName, ...lastParts] = b.name.split(" ");
			boardIds.push(
				await ctx.db.insert("people", {
					email: normalizeEmail(b.email),
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

		// 2. everyone who went through an application
		const entries: Entry[] = [
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
				scores: [9, 8, 9],
				person: {
					tier: "member",
					stage: "active",
					accessFrom: now - 30 * DAY,
					accessUntil: now + 90 * DAY,
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
				scores: [8, 9, 7],
				person: {
					tier: "member",
					stage: "active",
					accessFrom: now - 60 * DAY,
					accessUntil: now + 30 * DAY,
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
				scores: [9, 9, 8],
				person: {
					tier: "core",
					stage: "active",
					accessFrom: now - 10 * DAY,
					accessUntil: now + 120 * DAY,
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
				scores: [7, 8, 8],
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
				scores: [9, 8, 9],
				person: {
					tier: "member",
					stage: "onboarding",
					accessFrom: now + 7 * DAY,
					accessUntil: now + 100 * DAY,
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
				scores: [8, 7, 8],
				person: {
					tier: "guest",
					stage: "active",
					accessFrom: now - 5 * DAY,
					accessUntil: now + 25 * DAY,
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
				scores: [7, 7, 6],
				person: {
					tier: "guest",
					stage: "expired", // EXPIRED
					accessFrom: now - 40 * DAY,
					accessUntil: now - 2 * DAY,
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
				scores: [8, 8, 7],
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
				scores: [9, 8, 8],
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
				scores: [4, 5, 3],
				stage: "denied",
				deniedAt: now - 60 * DAY,
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
				scores: [8, 7, 8],
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
				scores: [8, 8, 9],
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
				scores: [6], // partially scored
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
				scores: [3, 4, 2],
				stage: "denied",
				deniedAt: now - 45 * DAY,
			},
			{
				name: "Joan Clarke",
				email: "joan@jfloor.test",
				vertical: ["security"],
				ventureName: "Cipher Works",
				productStage: "mvp",
				fundingStage: "bootstrapped",
				scores: [5, 4, 5],
				stage: "denied",
				deniedAt: now - 20 * DAY,
			},
		];

		// One board member owns every seeded override and audit entry, so the
		// drawer shows a name rather than degrading to "the board".
		const actorId = boardIds[1] ?? boardIds[0];

		for (let i = 0; i < entries.length; i++) {
			const e = entries[i];
			const [fn, ...lnParts] = e.name.split(" ");
			const ln = lnParts.join(" ");
			// Staggered so "State since" reads differently down the list instead of
			// "Today" on every row.
			const stageSince = now - (e.stageAgeDays ?? i) * DAY;
			const personId = await ctx.db.insert("people", {
				email: normalizeEmail(e.email),
				firstName: fn,
				lastName: ln,
				tier: e.person?.tier ?? "prospect",
				stage: e.person?.stage ?? e.stage ?? "verified",
				formerOf: e.person?.formerOf,
				formerReason: e.person?.formerReason,
				stageSince,
				provenance: "seed",
				door: e.door
					? {
							override: e.door.override,
							reason: e.door.reason,
							byId: actorId,
							at: now - DAY,
						}
					: { override: "none" },
				accessFrom: e.person?.accessFrom,
				accessUntil: e.person?.accessUntil,
				deniedAt: e.deniedAt,
				vertical: e.vertical,
				venture: {
					name: e.ventureName,
					productStage: e.productStage,
					fundingStage: e.fundingStage,
					links: e.links,
					// Synthesised exactly as the old applications insert did.
					description: `${e.ventureName} — building in ${e.vertical.join(", ")}.`,
					whyJoin: `Joining J Floor to grow ${e.ventureName}.`,
				},
				// ONE shared score now, not one per board member: `toScores` and its
				// `{ boardMemberId, value }[]` shape die with the applications table.
				board: { score: e.scores?.[0] },
				// Spread submission dates a few days apart (deterministic) so the
				// Date column and the date sort have something to show.
				submittedAt: now - i * 3 * DAY,
				verifiedAt: now,
			});

			// The agreement their CURRENT tier requires. Without this every
			// member and guest carries an "agreement not signed" flag, which is
			// both wrong and hides whether any other flag renders.
			const variant =
				e.person?.tier === "guest"
					? "guest"
					: e.person?.tier === "member" ||
						  e.person?.tier === "core" ||
						  e.person?.formerOf === "member"
						? "member"
						: null;
			if (e.signed && variant !== null) {
				await ctx.db.insert("signatures", {
					personId,
					email: normalizeEmail(e.email),
					variant,
					signedName: e.name,
					agreementVersion: "1",
					agreementHash: `seed-${e.email}`,
					signedAt: stageSince,
					sourceUrl: "https://example.test/seed-agreement.pdf",
				});
			}

			await seedHistory(ctx, {
				personId,
				actorId,
				entry: e,
				stageSince,
				signedVariant: e.signed ? variant : null,
			});
		}

		// Optional real member account (magic-link-reachable) for testing the
		// member-facing directory view. Upsert so reseeds keep it a member.
		let memberProvisioned = false;
		if (args.memberEmail) {
			const memberEmail = normalizeEmail(args.memberEmail);
			const existing = await personByEmail(ctx, memberEmail);
			const profile = {
				firstName: "Member",
				lastName: "Tester",
				tier: "member" as const,
				stage: "active" as const,
				stageSince: now,
				provenance: "seed" as const,
				door: { override: "none" as const },
				accessFrom: now - DAY,
				accessUntil: now + 90 * DAY,
			};
			if (existing) await ctx.db.patch(existing._id, profile);
			else
				await ctx.db.insert("people", {
					email: memberEmail,
					...profile,
				});
			memberProvisioned = !existing;
		}

		await seedInventory(ctx);
		await seedWifi(ctx);

		return {
			board: boardIds.length,
			people:
				boardIds.length + entries.length + (memberProvisioned ? 1 : 0),
		};
	},
});
