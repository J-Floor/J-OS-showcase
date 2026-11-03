import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { perkPath, perkRequestPath } from "./emails/urls.ts";
import { DAY_MS } from "./lib/constants.ts";
import { isPerkExpired } from "./lib/perks.ts";
import { NAME_MAX, TEXT_MAX } from "./lib/validate.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function createTester() {
	return convexTest(schema, modules);
}
type Tester = ReturnType<typeof createTester>;
type Tier = Doc<"people">["tier"];

const BOARD_EMAIL = "board@example.com";
const CONTACT_EMAIL = "anna@example.com";
const CALLER_EMAIL = "caller@example.com";

/** Every signed-in tier but board and admin: none of them may change the
 *  catalog. */
const NOT_BOARD = ["guest", "member", "core", "staff"] as const;

async function seedPerson(
	backend: Tester,
	email: string,
	tier: Tier,
	fields: Partial<
		Pick<Doc<"people">, "firstName" | "lastName" | "accessUntil">
	> = {}
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Test",
			lastName: "Person",
			tier,
			stage: "active",
			stageSince: Date.now(),
			...fields,
		})
	);
}

/** A board caller, and Anna Berg: an entitled board member to be the contact. */
async function setup() {
	const backend = createTester();
	const boardId = await seedPerson(backend, BOARD_EMAIL, "board");
	const contactId = await seedPerson(backend, CONTACT_EMAIL, "board", {
		firstName: "Anna",
		lastName: "Berg",
	});
	const asBoard = backend.withIdentity({ email: BOARD_EMAIL });
	return { backend, boardId, contactId, asBoard };
}

async function asTier(backend: Tester, tier: Tier) {
	await seedPerson(backend, CALLER_EMAIL, tier);
	return backend.withIdentity({ email: CALLER_EMAIL });
}

function perkInput(contactId: Id<"people">) {
	return {
		partner: "Example Cloud",
		title: "Hosting credits",
		terms: "Credits for the first year.",
		category: "cloud" as const,
		contactId,
	};
}

/** {@link setup}, plus a perk with every optional field set, so a test can
 *  see a field it did not touch survive. */
async function setupWithPerk() {
	const seeded = await setup();
	const perkId = await seeded.asBoard.mutation(api.perks.createPerk, {
		...perkInput(seeded.contactId),
		link: "https://credits.example.com/apply",
		validUntil: "2026-12-31",
	});
	return { ...seeded, perkId };
}

/** A perk written straight to the table, for rows `createPerk` never writes
 *  (no contact) or to skip the contact plumbing. */
async function insertPerk(
	backend: Tester,
	fields: { partner: string; title: string; contactId?: Id<"people"> }
): Promise<Id<"perks">> {
	return backend.run((context) =>
		context.db.insert("perks", {
			terms: "Terms apply.",
			category: "other",
			createdAt: Date.now(),
			...fields,
		})
	);
}

async function readPerk(backend: Tester, perkId: Id<"perks">) {
	return backend.run((context) => context.db.get(perkId));
}

async function allPerks(backend: Tester) {
	return backend.run((context) => context.db.query("perks").collect());
}

async function insertRequests(
	backend: Tester,
	{
		perkId,
		personId,
		count,
	}: { perkId: Id<"perks">; personId: Id<"people">; count: number }
): Promise<void> {
	await backend.run(async (context) => {
		for (let index = 0; index < count; index++) {
			const requestedAt = Date.now() + index;
			await context.db.insert("perkRequests", {
				perkId,
				personId,
				requestedAt,
				status: "requested",
				statusAt: requestedAt,
			});
		}
	});
}

async function requestCount(
	backend: Tester,
	perkId: Id<"perks">
): Promise<number> {
	const rows = await backend.run((context) =>
		context.db
			.query("perkRequests")
			.withIndex("by_perkId_and_requestedAt", (range) =>
				range.eq("perkId", perkId)
			)
			.collect()
	);
	return rows.length;
}

/** convex-test records a scheduled job when it is queued (see
 *  convex/AGENTS.md), so its name and args prove which function was queued. */
async function scheduledJobs(backend: Tester) {
	return backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
}

/** The jobs a test queued, without the `perkAdded` dispatch `createPerk`
 *  queues for the perk `setupWithPerk` makes. */
async function purgeJobs(backend: Tester) {
	const jobs = await scheduledJobs(backend);
	return jobs.filter((job) => job.name === "perks:purgePerkRequests");
}

async function dispatches(backend: Tester) {
	const jobs = await scheduledJobs(backend);
	return jobs.filter((job) => job.name === "notify/dispatch:run");
}

describe("listPerks", () => {
	it.each(["guest", "member", "core", "board", "admin"] as const)(
		"lets a %s list the perks",
		async (tier) => {
			const { backend, contactId, asBoard } = await setup();
			await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
			const caller = await asTier(backend, tier);
			const rows = await caller.query(api.perks.listPerks, {});
			expect(rows.map((row) => row.title)).toEqual(["Hosting credits"]);
		}
	);

	it("refuses staff", async () => {
		const backend = createTester();
		const asStaff = await asTier(backend, "staff");
		await expect(asStaff.query(api.perks.listPerks, {})).rejects.toThrow(
			"Forbidden"
		);
	});

	it("refuses a guest whose access has ended", async () => {
		const backend = createTester();
		await seedPerson(backend, CALLER_EMAIL, "guest", {
			accessUntil: Date.now() - DAY_MS,
		});
		await expect(
			backend
				.withIdentity({ email: CALLER_EMAIL })
				.query(api.perks.listPerks, {})
		).rejects.toThrow("AccessExpired");
	});

	it("refuses a signed-out caller", async () => {
		const backend = createTester();
		await expect(backend.query(api.perks.listPerks, {})).rejects.toThrow(
			"NotAuthenticated"
		);
	});

	it("joins the contact's display name and first name on every perk they hold", async () => {
		const { contactId, asBoard } = await setup();
		await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
		await asBoard.mutation(api.perks.createPerk, {
			...perkInput(contactId),
			title: "Support plan",
		});
		const rows = await asBoard.query(api.perks.listPerks, {});
		expect(
			rows.map((row) => [row.contactName, row.contactFirstName])
		).toEqual([
			["Anna Berg", "Anna"],
			["Anna Berg", "Anna"],
		]);
	});

	it("joins each perk's own contact", async () => {
		const { backend, contactId, asBoard } = await setup();
		const otherId = await seedPerson(backend, "carl@example.com", "admin", {
			firstName: "Carl",
			lastName: "Dorn",
		});
		await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
		await asBoard.mutation(api.perks.createPerk, {
			...perkInput(otherId),
			partner: "Example Legal",
			title: "Advice",
		});
		const rows = await asBoard.query(api.perks.listPerks, {});
		expect(
			rows.map((row) => [
				row.partner,
				row.contactName,
				row.contactFirstName,
			])
		).toEqual([
			["Example Cloud", "Anna Berg", "Anna"],
			["Example Legal", "Carl Dorn", "Carl"],
		]);
	});

	it("leaves both contact names out when the contact is gone or was never set", async () => {
		const { backend, contactId, asBoard } = await setup();
		await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
		await insertPerk(backend, {
			partner: "Example Legal",
			title: "Advice",
		});
		await backend.run((context) => context.db.delete(contactId));
		const rows = await asBoard.query(api.perks.listPerks, {});
		// The first perk's contact row is gone; the second never had one.
		expect(
			rows.map((row) => [
				row.title,
				"contactName" in row,
				"contactFirstName" in row,
			])
		).toEqual([
			["Hosting credits", false, false],
			["Advice", false, false],
		]);
	});

	it("sorts by partner, then by title", async () => {
		const { backend, asBoard } = await setup();
		// Inserted in neither creation nor name order, so only a sort passes.
		await insertPerk(backend, {
			partner: "Beta Example",
			title: "Zinc plan",
		});
		await insertPerk(backend, {
			partner: "Alpha Example",
			title: "Second plan",
		});
		await insertPerk(backend, {
			partner: "Beta Example",
			title: "Apple plan",
		});
		const rows = await asBoard.query(api.perks.listPerks, {});
		expect(rows.map((row) => `${row.partner} / ${row.title}`)).toEqual([
			"Alpha Example / Second plan",
			"Beta Example / Apple plan",
			"Beta Example / Zinc plan",
		]);
	});

	it.each([
		["was demoted to member", { tier: "member" as const }],
		["is out of their access window", { accessUntil: -DAY_MS }],
	])(
		"leaves both contact names out while the contact %s",
		async (_case, change: { tier?: Tier; accessUntil?: number }) => {
			const { backend, contactId, asBoard } = await setup();
			await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
			// A window that closed a day ago, relative to now.
			const patch =
				change.accessUntil === undefined
					? change
					: { accessUntil: Date.now() + change.accessUntil };
			await backend.run((context) => context.db.patch(contactId, patch));
			const [row] = await asBoard.query(api.perks.listPerks, {});
			// The row still names them: only the join leaves them out.
			expect(row.contactId).toBe(contactId);
			expect("contactName" in row).toBe(false);
			expect("contactFirstName" in row).toBe(false);
		}
	);

	it("joins the names of a contact whose access window is still open", async () => {
		const { backend, contactId, asBoard } = await setup();
		await asBoard.mutation(api.perks.createPerk, perkInput(contactId));
		await backend.run((context) =>
			context.db.patch(contactId, { accessUntil: Date.now() + DAY_MS })
		);
		const [row] = await asBoard.query(api.perks.listPerks, {});
		expect([row.contactName, row.contactFirstName]).toEqual([
			"Anna Berg",
			"Anna",
		]);
	});

	it("compares partner and title by one English collation, whatever the server's locale", async () => {
		const { backend, asBoard } = await setup();
		await insertPerk(backend, {
			partner: "Beta Example",
			title: "Zinc plan",
		});
		await insertPerk(backend, {
			partner: "Beta Example",
			title: "Apple plan",
		});
		await insertPerk(backend, { partner: "Alpha Example", title: "Plan" });
		const compare = vi.spyOn(String.prototype, "localeCompare");
		try {
			await asBoard.query(api.perks.listPerks, {});
			// The sort's own calls: those made on a perk's partner or title.
			const names = new Set([
				"Alpha Example",
				"Beta Example",
				"Apple plan",
				"Zinc plan",
				"Plan",
			]);
			const sortCalls = compare.mock.calls.filter((_call, index) =>
				names.has(String(compare.mock.contexts[index]))
			);
			// Both keys were compared: the two Beta Example perks tie on partner.
			expect(
				sortCalls.some(
					([other]) => other === "Apple plan" || other === "Zinc plan"
				)
			).toBe(true);
			const [, firstLocale, firstOptions] = sortCalls[0];
			expect(firstLocale).toBe("en");
			expect(firstOptions).toBeDefined();
			for (const [, locale, options] of sortCalls) {
				expect(locale).toBe("en");
				expect(options).toBe(firstOptions);
			}
		} finally {
			compare.mockRestore();
		}
	});
});

type PerkOverride = {
	partner?: string;
	title?: string;
	terms?: string;
	link?: string;
	validUntil?: string;
};

const REFUSED_INPUTS: [string, PerkOverride, RegExp][] = [
	["a blank partner", { partner: "   " }, /PerkFieldRequired/],
	["a blank title", { title: "" }, /PerkFieldRequired/],
	["blank terms", { terms: " \n " }, /PerkFieldRequired/],
	[
		"a partner over NAME_MAX",
		{ partner: "p".repeat(NAME_MAX + 1) },
		/FieldTooLong/,
	],
	[
		"a title over NAME_MAX",
		{ title: "t".repeat(NAME_MAX + 1) },
		/FieldTooLong/,
	],
	[
		"terms over TEXT_MAX",
		{ terms: "t".repeat(TEXT_MAX + 1) },
		/FieldTooLong/,
	],
	[
		"a link over TEXT_MAX",
		{ link: `https://example.com/${"a".repeat(TEXT_MAX)}` },
		/FieldTooLong/,
	],
	["a javascript: link", { link: "javascript:alert(1)" }, /PerkLinkInvalid/],
	["a data: link", { link: "data:text/html,hello" }, /PerkLinkInvalid/],
	["an impossible end date", { validUntil: "2026-02-30" }, /PerkDateInvalid/],
	[
		"an end date not written YYYY-MM-DD",
		{ validUntil: "31.12.2026" },
		/PerkDateInvalid/,
	],
];

describe("createPerk", () => {
	it.each(NOT_BOARD)("refuses a %s and writes nothing", async (tier) => {
		const { backend, contactId } = await setup();
		const caller = await asTier(backend, tier);
		await expect(
			caller.mutation(api.perks.createPerk, perkInput(contactId))
		).rejects.toThrow("Forbidden");
		expect(await allPerks(backend)).toEqual([]);
	});

	it("lets an admin create a perk", async () => {
		const { backend, contactId } = await setup();
		const adminId = await seedPerson(backend, CALLER_EMAIL, "admin");
		const perkId = await backend
			.withIdentity({ email: CALLER_EMAIL })
			.mutation(api.perks.createPerk, perkInput(contactId));
		const perk = await readPerk(backend, perkId);
		expect(perk?.createdBy).toBe(adminId);
	});

	it("stores the fields trimmed, the link normalised, and who created it", async () => {
		const { backend, boardId, contactId, asBoard } = await setup();
		const perkId = await asBoard.mutation(api.perks.createPerk, {
			partner: "  Example Cloud  ",
			title: " Hosting credits ",
			terms: "\n Credits for the first year. \n",
			category: "cloud",
			contactId,
			link: "  credits.example.com/apply ",
			validUntil: "2026-12-31",
		});
		const perk = await readPerk(backend, perkId);
		expect(perk).toMatchObject({
			partner: "Example Cloud",
			title: "Hosting credits",
			terms: "Credits for the first year.",
			category: "cloud",
			contactId,
			link: "https://credits.example.com/apply",
			validUntil: "2026-12-31",
			createdBy: boardId,
		});
		expect(perk?.createdAt).toEqual(expect.any(Number));
	});

	it("stores no link for a blank one, and no end date when none is given", async () => {
		const { backend, contactId, asBoard } = await setup();
		const perkId = await asBoard.mutation(api.perks.createPerk, {
			...perkInput(contactId),
			link: "   ",
		});
		const perk = await readPerk(backend, perkId);
		expect(perk?.link).toBeUndefined();
		expect(perk?.validUntil).toBeUndefined();
	});

	it.each(REFUSED_INPUTS)(
		"refuses %s and writes nothing",
		async (_label, override, message) => {
			const { backend, contactId, asBoard } = await setup();
			await expect(
				asBoard.mutation(api.perks.createPerk, {
					...perkInput(contactId),
					...override,
				})
			).rejects.toThrow(message);
			expect(await allPerks(backend)).toEqual([]);
		}
	);

	it("refuses a contact who is not board-level", async () => {
		const { backend, asBoard } = await setup();
		const memberId = await seedPerson(backend, CALLER_EMAIL, "member");
		await expect(
			asBoard.mutation(api.perks.createPerk, perkInput(memberId))
		).rejects.toThrow(/PerkContactNotBoard/);
		expect(await allPerks(backend)).toEqual([]);
	});

	it("refuses a board contact whose access has ended", async () => {
		const { backend, asBoard } = await setup();
		const lapsedId = await seedPerson(backend, CALLER_EMAIL, "board", {
			accessUntil: Date.now() - DAY_MS,
		});
		await expect(
			asBoard.mutation(api.perks.createPerk, perkInput(lapsedId))
		).rejects.toThrow(/PerkContactNotBoard/);
	});

	it("refuses a contact who no longer exists", async () => {
		const { backend, contactId, asBoard } = await setup();
		await backend.run((context) => context.db.delete(contactId));
		await expect(
			asBoard.mutation(api.perks.createPerk, perkInput(contactId))
		).rejects.toThrow(/PerkContactNotBoard/);
	});

	it("accepts an admin as the contact", async () => {
		const { backend, asBoard } = await setup();
		const adminId = await seedPerson(backend, CALLER_EMAIL, "admin");
		const perkId = await asBoard.mutation(
			api.perks.createPerk,
			perkInput(adminId)
		);
		const perk = await readPerk(backend, perkId);
		expect(perk?.contactId).toBe(adminId);
	});
});

describe("createPerk tells the community", () => {
	// 11:00 in Zurich on 2026-10-29, so "today" there is 2026-10-29. Faking
	// Date pins that day; faking setTimeout keeps the dispatch from running,
	// so the test sees what was queued.
	const NOW = Date.UTC(2026, 9, 29, 10, 0);

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends perkAdded with the partner, title, perk and who added it", async () => {
		const { backend, boardId, contactId, asBoard } = await setup();
		const perkId = await asBoard.mutation(
			api.perks.createPerk,
			perkInput(contactId)
		);
		expect(await dispatches(backend)).toEqual([
			expect.objectContaining({
				args: [
					{
						kind: "perkAdded",
						payload: {
							perkId,
							partner: "Example Cloud",
							perkTitle: "Hosting credits",
							addedBy: boardId,
						},
					},
				],
			}),
		]);
	});

	it("sends for a perk whose last day is today", async () => {
		const { backend, contactId, asBoard } = await setup();
		await asBoard.mutation(api.perks.createPerk, {
			...perkInput(contactId),
			validUntil: "2026-10-29",
		});
		expect(await dispatches(backend)).toHaveLength(1);
	});

	it("sends nothing for a perk that has already ended", async () => {
		const { backend, contactId, asBoard } = await setup();
		await asBoard.mutation(api.perks.createPerk, {
			...perkInput(contactId),
			validUntil: "2026-10-28",
		});
		expect(await allPerks(backend)).toHaveLength(1);
		expect(await dispatches(backend)).toEqual([]);
	});
});

describe("updatePerk", () => {
	it.each(NOT_BOARD)(
		"refuses a %s and leaves the perk as it was",
		async (tier) => {
			const { backend, perkId } = await setupWithPerk();
			const before = await readPerk(backend, perkId);
			const caller = await asTier(backend, tier);
			await expect(
				caller.mutation(api.perks.updatePerk, {
					perkId,
					title: "Taken over",
				})
			).rejects.toThrow("Forbidden");
			expect(await readPerk(backend, perkId)).toEqual(before);
		}
	);

	it("changes only the field it is given", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		const before = await readPerk(backend, perkId);
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			title: "  Bigger credits ",
		});
		expect(await readPerk(backend, perkId)).toEqual({
			...before,
			title: "Bigger credits",
		});
	});

	it("changes the category, and nothing else", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		const before = await readPerk(backend, perkId);
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			category: "software",
		});
		expect(await readPerk(backend, perkId)).toEqual({
			...before,
			category: "software",
		});
	});

	it("refuses an edit that would blank a required field, and keeps the row", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		const before = await readPerk(backend, perkId);
		await expect(
			asBoard.mutation(api.perks.updatePerk, { perkId, partner: "  " })
		).rejects.toThrow(/PerkFieldRequired/);
		expect(await readPerk(backend, perkId)).toEqual(before);
	});

	it("refuses an over-long title", async () => {
		const { perkId, asBoard } = await setupWithPerk();
		await expect(
			asBoard.mutation(api.perks.updatePerk, {
				perkId,
				title: "t".repeat(NAME_MAX + 1),
			})
		).rejects.toThrow(/FieldTooLong/);
	});

	it("clears the end date with null, so an expired perk is active again", async () => {
		const { backend, contactId, asBoard } = await setup();
		const perkId = await asBoard.mutation(api.perks.createPerk, {
			...perkInput(contactId),
			validUntil: "2020-01-31",
		});
		const expired = await readPerk(backend, perkId);
		expect(isPerkExpired(expired?.validUntil, Date.now())).toBe(true);

		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			validUntil: null,
		});

		const cleared = await readPerk(backend, perkId);
		expect(cleared?.validUntil).toBeUndefined();
		expect(isPerkExpired(cleared?.validUntil, Date.now())).toBe(false);
	});

	it("clears the link with null and keeps the end date", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		await asBoard.mutation(api.perks.updatePerk, { perkId, link: null });
		const perk = await readPerk(backend, perkId);
		expect(perk?.link).toBeUndefined();
		expect(perk?.validUntil).toBe("2026-12-31");
	});

	it("normalises a new link, and refuses a javascript: one", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			link: "partners.example.com",
		});
		const updated = await readPerk(backend, perkId);
		expect(updated?.link).toBe("https://partners.example.com/");

		await expect(
			asBoard.mutation(api.perks.updatePerk, {
				perkId,
				link: "javascript:alert(1)",
			})
		).rejects.toThrow(/PerkLinkInvalid/);
		const kept = await readPerk(backend, perkId);
		expect(kept?.link).toBe("https://partners.example.com/");
	});

	it("sets a new end date, and refuses an impossible one", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			validUntil: "2027-06-30",
		});
		const updated = await readPerk(backend, perkId);
		expect(updated?.validUntil).toBe("2027-06-30");

		await expect(
			asBoard.mutation(api.perks.updatePerk, {
				perkId,
				validUntil: "2027-02-29",
			})
		).rejects.toThrow(/PerkDateInvalid/);
		const kept = await readPerk(backend, perkId);
		expect(kept?.validUntil).toBe("2027-06-30");
	});

	it("moves the perk to another board-level contact, and refuses a member", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		const adminId = await seedPerson(backend, "admin@example.com", "admin");
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			contactId: adminId,
		});
		const moved = await readPerk(backend, perkId);
		expect(moved?.contactId).toBe(adminId);

		const memberId = await seedPerson(backend, CALLER_EMAIL, "member");
		await expect(
			asBoard.mutation(api.perks.updatePerk, {
				perkId,
				contactId: memberId,
			})
		).rejects.toThrow(/PerkContactNotBoard/);
		const kept = await readPerk(backend, perkId);
		expect(kept?.contactId).toBe(adminId);
	});

	it("gives a contact to a perk that has none", async () => {
		const { backend, contactId, asBoard } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Legal",
			title: "Advice",
		});
		await asBoard.mutation(api.perks.updatePerk, { perkId, contactId });
		const perk = await readPerk(backend, perkId);
		expect(perk?.contactId).toBe(contactId);
	});

	it("still saves an edit after the current contact has lost board level", async () => {
		const { backend, contactId, perkId, asBoard } = await setupWithPerk();
		await backend.run((context) =>
			context.db.patch(contactId, { tier: "member" })
		);
		await asBoard.mutation(api.perks.updatePerk, {
			perkId,
			terms: "Credits for two years.",
		});
		const perk = await readPerk(backend, perkId);
		expect(perk?.terms).toBe("Credits for two years.");
		expect(perk?.contactId).toBe(contactId);
	});

	it("refuses a perk that no longer exists", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		await backend.run((context) => context.db.delete(perkId));
		await expect(
			asBoard.mutation(api.perks.updatePerk, { perkId, title: "Gone" })
		).rejects.toThrow(/PerkNotFound/);
	});
});

describe("deletePerk", () => {
	// convex-test arms each scheduled job with a timer. A fake one keeps the
	// purge from running mid-test, so the test sees exactly what was queued.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(NOT_BOARD)("refuses a %s and keeps the perk", async (tier) => {
		const { backend, perkId } = await setupWithPerk();
		const caller = await asTier(backend, tier);
		await expect(
			caller.mutation(api.perks.deletePerk, { perkId })
		).rejects.toThrow("Forbidden");
		expect(await readPerk(backend, perkId)).not.toBeNull();
		expect(await purgeJobs(backend)).toEqual([]);
	});

	it("deletes the perk at once and schedules the purge of its requests", async () => {
		const { backend, boardId, perkId, asBoard } = await setupWithPerk();
		await insertRequests(backend, { perkId, personId: boardId, count: 2 });

		await asBoard.mutation(api.perks.deletePerk, { perkId });

		expect(await readPerk(backend, perkId)).toBeNull();
		expect(await asBoard.query(api.perks.listPerks, {})).toEqual([]);
		const jobs = await purgeJobs(backend);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].name).toBe("perks:purgePerkRequests");
		expect(jobs[0].args).toEqual([{ perkId }]);
		// The requests go in the scheduled batches, not in this transaction.
		expect(await requestCount(backend, perkId)).toBe(2);
	});

	it("does nothing for a perk that is already gone", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();
		await asBoard.mutation(api.perks.deletePerk, { perkId });
		await expect(
			asBoard.mutation(api.perks.deletePerk, { perkId })
		).resolves.toBeNull();
		expect(await purgeJobs(backend)).toHaveLength(1);
	});
});

describe("purgePerkRequests", () => {
	// As in deletePerk: the test runs each batch itself, so the rescheduled
	// job must not also run on its own.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("deletes a perk's requests over more than one batch, and no other perk's", async () => {
		const { backend, boardId, contactId } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Cloud",
			title: "Credits",
			contactId,
		});
		const otherId = await insertPerk(backend, {
			partner: "Example Legal",
			title: "Advice",
			contactId,
		});
		// One more than a batch of 200, so the first run must hand on.
		await insertRequests(backend, {
			perkId,
			personId: boardId,
			count: 201,
		});
		await insertRequests(backend, {
			perkId: otherId,
			personId: boardId,
			count: 1,
		});

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await requestCount(backend, perkId)).toBe(1);
		const handedOn = await scheduledJobs(backend);
		expect(handedOn).toHaveLength(1);
		expect(handedOn[0].name).toBe("perks:purgePerkRequests");
		expect(handedOn[0].args).toEqual([{ perkId }]);

		// The rescheduled run, driven by hand: a short batch ends the chain.
		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await requestCount(backend, perkId)).toBe(0);
		expect(await scheduledJobs(backend)).toHaveLength(1);
		expect(await requestCount(backend, otherId)).toBe(1);
	});
});

/** History rows linking to `url`, one per recipient as `inbox.record` writes
 *  them. `perkPath`/`perkRequestPath` are the paths dispatch stores. */
async function insertNotifications(
	backend: Tester,
	{
		personId,
		url,
		kind,
		count,
	}: { personId: Id<"people">; url: string; kind: string; count: number }
): Promise<void> {
	await backend.run(async (context) => {
		for (let index = 0; index < count; index++) {
			await context.db.insert("notifications", {
				personId,
				kind,
				title: "Perk",
				body: "Example Cloud · Credits",
				url,
				createdAt: Date.now(),
			});
		}
	});
}

async function notificationUrls(backend: Tester): Promise<string[]> {
	const rows = await backend.run((context) =>
		context.db.query("notifications").collect()
	);
	return rows.map((row) => row.url);
}

async function requestIdsOf(
	backend: Tester,
	perkId: Id<"perks">
): Promise<Id<"perkRequests">[]> {
	const rows = await backend.run((context) =>
		context.db
			.query("perkRequests")
			.withIndex("by_perkId_and_requestedAt", (range) =>
				range.eq("perkId", perkId)
			)
			.collect()
	);
	return rows.map((row) => row._id);
}

describe("deleting a perk removes its notifications", () => {
	// The test runs each batch itself, so a rescheduled job must not also run
	// on its own.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("schedules the purge of the perk's notifications", async () => {
		const { backend, perkId, asBoard } = await setupWithPerk();

		await asBoard.mutation(api.perks.deletePerk, { perkId });

		const jobs = await scheduledJobs(backend);
		const purge = jobs.filter(
			(job) => job.name === "perks:purgePerkNotifications"
		);
		expect(purge).toHaveLength(1);
		expect(purge[0].args).toEqual([{ perkId }]);
	});

	it("purges a perk's notifications over more than one batch, and no other's", async () => {
		const { backend, boardId, contactId } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Cloud",
			title: "Credits",
			contactId,
		});
		const otherId = await insertPerk(backend, {
			partner: "Example Legal",
			title: "Advice",
			contactId,
		});
		// One more than a batch of 200, so the first run must hand on.
		await insertNotifications(backend, {
			personId: boardId,
			url: perkPath(perkId),
			kind: "perkAdded",
			count: 201,
		});
		await insertNotifications(backend, {
			personId: boardId,
			url: perkPath(otherId),
			kind: "perkAdded",
			count: 1,
		});
		await insertNotifications(backend, {
			personId: boardId,
			url: "/tasks?task=example",
			kind: "taskAssigned",
			count: 1,
		});

		await backend.mutation(internal.perks.purgePerkNotifications, {
			perkId,
		});

		expect(await notificationUrls(backend)).toHaveLength(3);
		const handedOn = await scheduledJobs(backend);
		expect(handedOn).toHaveLength(1);
		expect(handedOn[0].name).toBe("perks:purgePerkNotifications");
		expect(handedOn[0].args).toEqual([{ perkId }]);

		// The rescheduled run, driven by hand: a short batch ends the chain.
		await backend.mutation(internal.perks.purgePerkNotifications, {
			perkId,
		});

		const left = await notificationUrls(backend);
		expect(left).toHaveLength(2);
		expect(left).toEqual(
			expect.arrayContaining([perkPath(otherId), "/tasks?task=example"])
		);
		expect(await scheduledJobs(backend)).toHaveLength(1);
	});

	it("purges each request's notifications with the request, and no other perk's", async () => {
		const { backend, boardId, contactId } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Cloud",
			title: "Credits",
			contactId,
		});
		const otherId = await insertPerk(backend, {
			partner: "Example Legal",
			title: "Advice",
			contactId,
		});
		await insertRequests(backend, { perkId, personId: boardId, count: 2 });
		await insertRequests(backend, {
			perkId: otherId,
			personId: boardId,
			count: 1,
		});
		const requestIds = await requestIdsOf(backend, perkId);
		for (const requestId of requestIds) {
			await insertNotifications(backend, {
				personId: boardId,
				url: perkRequestPath(requestId),
				kind: "perkRequested",
				count: 3,
			});
		}
		const [otherRequestId] = await requestIdsOf(backend, otherId);
		await insertNotifications(backend, {
			personId: boardId,
			url: perkRequestPath(otherRequestId),
			kind: "perkRequested",
			count: 1,
		});

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await requestCount(backend, perkId)).toBe(0);
		expect(await notificationUrls(backend)).toEqual([
			perkRequestPath(otherRequestId),
		]);
		expect(await scheduledJobs(backend)).toEqual([]);
	});

	it("keeps a request whose notifications fill the batch, and finishes it next run", async () => {
		const { backend, boardId, contactId } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Cloud",
			title: "Credits",
			contactId,
		});
		await insertRequests(backend, { perkId, personId: boardId, count: 1 });
		const [requestId] = await requestIdsOf(backend, perkId);
		await insertNotifications(backend, {
			personId: boardId,
			url: perkRequestPath(requestId),
			kind: "perkRequested",
			count: 201,
		});

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await notificationUrls(backend)).toHaveLength(1);
		expect(await requestCount(backend, perkId)).toBe(1);
		expect(await scheduledJobs(backend)).toHaveLength(1);

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await notificationUrls(backend)).toEqual([]);
		expect(await requestCount(backend, perkId)).toBe(0);
		expect(await scheduledJobs(backend)).toHaveLength(1);
	});

	it("stops at the batch when a request delete uses its last slot", async () => {
		const { backend, boardId, contactId } = await setup();
		const perkId = await insertPerk(backend, {
			partner: "Example Cloud",
			title: "Credits",
			contactId,
		});
		await insertRequests(backend, { perkId, personId: boardId, count: 2 });
		const [firstId, secondId] = await requestIdsOf(backend, perkId);
		// 199 rows plus the request itself fill the batch of 200 exactly.
		await insertNotifications(backend, {
			personId: boardId,
			url: perkRequestPath(firstId),
			kind: "perkRequested",
			count: 199,
		});
		await insertNotifications(backend, {
			personId: boardId,
			url: perkRequestPath(secondId),
			kind: "perkRequested",
			count: 1,
		});

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await requestIdsOf(backend, perkId)).toEqual([secondId]);
		expect(await notificationUrls(backend)).toEqual([
			perkRequestPath(secondId),
		]);
		expect(await scheduledJobs(backend)).toHaveLength(1);

		await backend.mutation(internal.perks.purgePerkRequests, { perkId });

		expect(await requestCount(backend, perkId)).toBe(0);
		expect(await notificationUrls(backend)).toEqual([]);
		expect(await scheduledJobs(backend)).toHaveLength(1);
	});
});
