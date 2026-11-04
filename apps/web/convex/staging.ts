import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { DAY_MS, DAYS_PER_WEEK } from "./lib/constants.ts";
import { emailAllowlist } from "./lib/email.ts";
import { personByEmail } from "./lib/emailAddress.ts";
import {
	applyPreset,
	BOARD_PRESET,
	MEMBER_PRESET,
	type PersonName,
	type Preset,
} from "./lib/presets.ts";
import { invariant } from "./lib/result.ts";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import { seedInventory, seedWifi } from "./seed.ts";

/**
 * The staging deployment (`j-os-staging`, production deployment): its
 * accounts and example data. Run after the first deploy and whenever
 * `EMAIL_ALLOWLIST` changes, with the staging deploy key:
 *
 *   CONVEX_DEPLOY_KEY=<staging key> bunx convex run staging:seed
 *
 * Idempotent: an existing person is left as they are, and each block of
 * example data is added only while its table is empty, so a rerun adds the
 * new board accounts and nothing else.
 */

export const STAGING_SITE_URL = "https://staging.thejfloor.com";

const HOUR_MS = 3_600_000;

const EVENT_HOURS = 2;

const STAGING_WIFI = {
	ssid: "J floor (staging)",
	password: "staging-wifi-password",
};

const EXAMPLE_MEMBERS: { email: string; name: PersonName }[] = [
	{
		email: "mira@example.com",
		name: { firstName: "Mira", lastName: "Okafor" },
	},
	{
		email: "jonas@example.com",
		name: { firstName: "Jonas", lastName: "Berg" },
	},
];

/** `email`'s person; created in `preset` when there is none, else untouched. */
async function ensurePerson(
	context: MutationCtx,
	preset: Preset,
	email: string,
	name: PersonName
): Promise<Id<"people">> {
	const existing = await personByEmail(context, email);
	if (existing) return existing._id;
	const { person } = await applyPreset(context, preset, email, name);
	return person;
}

async function isEmpty(
	context: MutationCtx,
	table: "perks" | "events" | "projects" | "itemCategories"
): Promise<boolean> {
	return (await context.db.query(table).first()) === null;
}

type Cast = {
	board: Id<"people">;
	mira: Id<"people">;
	jonas: Id<"people">;
	now: number;
};

async function seedPerks(context: MutationCtx, cast: Cast): Promise<void> {
	const { board, mira, jonas, now } = cast;
	const cloud = await context.db.insert("perks", {
		partner: "Example Cloud",
		title: "Hosting credits for a year",
		terms: "For ventures under two years old. Ask the board for the code.",
		category: "cloud",
		link: "https://example.com/cloud",
		contactId: board,
		createdBy: board,
		createdAt: now,
	});
	const legal = await context.db.insert("perks", {
		partner: "Example Legal",
		title: "A free first consultation",
		terms: "One hour on incorporation or contracts.",
		category: "legal",
		contactId: board,
		createdBy: board,
		createdAt: now,
	});
	await context.db.insert("perkRequests", {
		perkId: cloud,
		personId: mira,
		requestedAt: now,
		note: "We are moving our staging servers.",
		status: "requested",
		statusAt: now,
	});
	await context.db.insert("perkRequests", {
		perkId: legal,
		personId: jonas,
		requestedAt: now - DAY_MS,
		status: "contacted",
		statusAt: now,
		statusById: board,
	});
}

async function seedEvent(context: MutationCtx, cast: Cast): Promise<void> {
	const { board, mira, now } = cast;
	// On the hour, a week out. Inserted directly: `createEvent` would schedule
	// reminder emails.
	const startsAt =
		Math.floor((now + DAYS_PER_WEEK * DAY_MS) / HOUR_MS) * HOUR_MS;
	const endsAt = startsAt + EVENT_HOURS * HOUR_MS;
	const event = await context.db.insert("events", {
		name: "Example demo night",
		startsAt,
		endsAt,
		startsAtLocal: zonedLocalFromEpoch(startsAt, SITE_TIMEZONE),
		endsAtLocal: zonedLocalFromEpoch(endsAt, SITE_TIMEZONE),
		createdBy: board,
		createdAt: now,
	});
	await context.db.insert("eventAttendance", {
		personId: mira,
		eventId: event,
		confirmedAt: now,
	});
}

async function seedProject(context: MutationCtx, cast: Cast): Promise<void> {
	const { board, mira, jonas, now } = cast;
	const projectId = await context.db.insert("projects", {
		name: "Example spring clean-up",
		description: "Tidy the shared space before the open day.",
		leaderId: board,
		startDate: now,
		createdBy: board,
	});
	await context.db.insert("tasks", {
		title: "Sort the storage room",
		status: "backlog",
		assigneeIds: [mira],
		projectId,
		createdBy: board,
	});
	await context.db.insert("tasks", {
		title: "Order new chairs",
		status: "in_progress",
		assigneeIds: [jonas],
		projectId,
		dueDate: now + DAYS_PER_WEEK * DAY_MS,
		createdBy: board,
	});
}

export const seed = internalMutation({
	args: {},
	handler: async (context) => {
		invariant(
			process.env.SITE_URL === STAGING_SITE_URL,
			`staging:seed runs only where SITE_URL is ${STAGING_SITE_URL}.`
		);
		const allowlist = emailAllowlist();
		invariant(
			allowlist?.length,
			"staging:seed needs EMAIL_ALLOWLIST: the board accounts come from it."
		);

		const boardIds: Id<"people">[] = [];
		for (const email of allowlist)
			boardIds.push(
				await ensurePerson(context, BOARD_PRESET, email, {
					firstName: email.split("@")[0],
					lastName: "Board",
				})
			);
		const memberIds: Id<"people">[] = [];
		for (const { email, name } of EXAMPLE_MEMBERS)
			memberIds.push(
				await ensurePerson(context, MEMBER_PRESET, email, name)
			);
		const [mira, jonas] = memberIds;
		const cast = { board: boardIds[0], mira, jonas, now: Date.now() };

		if (await isEmpty(context, "perks")) await seedPerks(context, cast);
		if (await isEmpty(context, "events")) await seedEvent(context, cast);
		if (await isEmpty(context, "projects"))
			await seedProject(context, cast);
		if (await isEmpty(context, "itemCategories"))
			await seedInventory(context);
		await seedWifi(context, STAGING_WIFI);
	},
});
