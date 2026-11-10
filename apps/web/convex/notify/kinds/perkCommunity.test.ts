import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { DAY_MS } from "../../lib/constants.ts";
import schema from "../../schema.ts";
import { KINDS, type PayloadOf } from "../registry.ts";
import type { Recipient } from "../types.ts";

// The three perk kinds the whole community hears: a new perk, the answer to
// your own request, and a perk ending in a week.

const modules = import.meta.glob("/convex/**/*.*s");
const SITE = "https://app.example.com";

type Backend = ReturnType<typeof convexTest>;

type Seed = {
	email: string;
	tier: Doc<"people">["tier"];
	accessUntil?: number;
	notificationPrefs?: Doc<"people">["notificationPrefs"];
};

async function seed(backend: Backend, person: Seed): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email: person.email,
			firstName: person.email.split("@")[0],
			lastName: "Example",
			tier: person.tier,
			stage: "active",
			stageSince: Date.now(),
			accessUntil: person.accessUntil,
			notificationPrefs: person.notificationPrefs,
		})
	);
}

/** One of every tier, entitled or not: who can view Perks and who cannot. */
async function seedEveryone(backend: Backend) {
	const viewers = [
		await seed(backend, { email: "mo@example.com", tier: "member" }),
		await seed(backend, { email: "co@example.com", tier: "core" }),
		await seed(backend, { email: "bo@example.com", tier: "board" }),
		await seed(backend, { email: "ad@example.com", tier: "admin" }),
		await seed(backend, {
			email: "gus@example.com",
			tier: "guest",
			accessUntil: Date.now() + DAY_MS,
		}),
	];
	await seed(backend, { email: "st@example.com", tier: "staff" });
	await seed(backend, { email: "fo@example.com", tier: "former" });
	await seed(backend, { email: "pr@example.com", tier: "prospect" });
	await seed(backend, {
		email: "late@example.com",
		tier: "guest",
		accessUntil: Date.now() - DAY_MS,
	});
	return viewers;
}

function recipient(personId: string, firstName = "Anna"): Recipient {
	return {
		personId: personId as Id<"people">,
		email: `${firstName}@example.com`,
		firstName,
		tier: "member",
		prefs: undefined,
	};
}

function sorted(ids: string[]): string[] {
	// eslint-disable-next-line id-length -- conventional comparator parameter names
	return [...ids].sort((a, b) => a.localeCompare(b));
}

const PERK = "perk1" as Id<"perks">;
const HOSTILE = { partner: "<b>Nimbus</b>", perkTitle: "<script>x</script>" };

const ADDED = {
	perkId: PERK,
	partner: "Nimbus",
	perkTitle: "Cloud credits",
	addedBy: "board1" as Id<"people">,
} satisfies PayloadOf<"perkAdded">;

const OUTCOME = {
	requestId: "request1" as Id<"perkRequests">,
	perkId: PERK,
	personId: "ada1" as Id<"people">,
	partner: "Nimbus",
	perkTitle: "Cloud credits",
	outcome: "granted",
} satisfies PayloadOf<"perkRequestOutcome">;

const EXPIRING = {
	perkId: PERK,
	perkTitle: "Cloud credits",
	validUntil: "2026-11-09",
} satisfies PayloadOf<"perkExpiringSoon">;

beforeEach(() => {
	vi.stubEnv("SITE_URL", SITE);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("perk community kinds", () => {
	it("all sit in the community perks category", () => {
		expect(KINDS.perkAdded.category).toBe("perkUpdates");
		expect(KINDS.perkRequestOutcome.category).toBe("perkUpdates");
		expect(KINDS.perkExpiringSoon.category).toBe("perkUpdates");
	});
});

describe("perkAdded", () => {
	it("reaches everyone who can view Perks: entitled guests, members, core and board", async () => {
		const backend = convexTest(schema, modules);
		const viewers = await seedEveryone(backend);
		const ids = await backend.run((context) =>
			KINDS.perkAdded.audience(context, ADDED)
		);
		expect(sorted(ids)).toEqual(sorted(viewers));
	});

	it("leaves out the board member who added the perk", async () => {
		const backend = convexTest(schema, modules);
		const viewers = await seedEveryone(backend);
		const adder = await seed(backend, {
			email: "adder@example.com",
			tier: "board",
		});
		const ids = await backend.run((context) =>
			KINDS.perkAdded.audience(context, { ...ADDED, addedBy: adder })
		);
		expect(sorted(ids)).toEqual(sorted(viewers));
	});

	it("leaves nobody out when no one added it", async () => {
		const backend = convexTest(schema, modules);
		const viewers = await seedEveryone(backend);
		const board = await seed(backend, {
			email: "adder@example.com",
			tier: "board",
		});
		const ids = await backend.run((context) =>
			KINDS.perkAdded.audience(context, {
				perkId: PERK,
				partner: "Nimbus",
				perkTitle: "Cloud credits",
			})
		);
		expect(sorted(ids)).toEqual(sorted([...viewers, board]));
	});

	it("pushes the partner and title, linked to the perk", () => {
		expect(KINDS.perkAdded.push(ADDED, recipient("mo1"))).toEqual({
			title: "New perk",
			body: "Nimbus · Cloud credits",
			url: `${SITE}/perks?perk=perk1`,
			tag: "perk-perk1-added",
		});
	});
});

describe("perkRequestOutcome", () => {
	it("reaches the requester alone, while they are entitled", async () => {
		const backend = convexTest(schema, modules);
		const [member] = await seedEveryone(backend);
		const lapsed = await seed(backend, {
			email: "gone@example.com",
			tier: "guest",
			accessUntil: Date.now() - DAY_MS,
		});
		const toMember = await backend.run((context) =>
			KINDS.perkRequestOutcome.audience(context, {
				...OUTCOME,
				personId: member,
			})
		);
		const toLapsed = await backend.run((context) =>
			KINDS.perkRequestOutcome.audience(context, {
				...OUTCOME,
				personId: lapsed,
			})
		);
		expect(toMember).toEqual([member]);
		expect(toLapsed).toEqual([]);
	});

	it("skips a requester who has since become staff, who cannot view Perks", async () => {
		const backend = convexTest(schema, modules);
		const staff = await seed(backend, {
			email: "st@example.com",
			tier: "staff",
		});
		const ids = await backend.run((context) =>
			KINDS.perkRequestOutcome.audience(context, {
				...OUTCOME,
				personId: staff,
			})
		);
		expect(ids).toEqual([]);
	});

	it.each([
		["granted", "Perk request granted"],
		["declined", "Perk request declined"],
	] as const)("pushes a %s outcome, linked to the perk", (outcome, title) => {
		expect(
			KINDS.perkRequestOutcome.push(
				{ ...OUTCOME, outcome },
				recipient("ada1")
			)
		).toEqual({
			title,
			body: `Your request for Cloud credits was ${outcome}`,
			url: `${SITE}/perks?perk=perk1`,
			tag: "perk-request-request1-outcome",
		});
	});

	it.each(["granted", "declined"] as const)(
		"emails a %s outcome",
		(outcome) => {
			const email = KINDS.perkRequestOutcome.email?.(
				{ ...OUTCOME, outcome },
				recipient("ada1")
			);
			expect(email?.subject).toBe(
				`Your request for Cloud credits was ${outcome}`
			);
			expect(email?.text.replaceAll(/\s+/g, " ")).toContain(
				`Hi Anna, your request for Cloud credits from Nimbus was ${outcome}.`
			);
			expect(email?.html).toContain(`href="${SITE}/perks?perk=perk1"`);
		}
	);

	it("escapes markup in the partner and title", () => {
		const email = KINDS.perkRequestOutcome.email?.(
			{ ...OUTCOME, ...HOSTILE },
			recipient("ada1")
		);
		expect(email?.html).not.toContain("<script>");
		expect(email?.html).not.toContain("<b>Nimbus");
		expect(email?.html).toContain("&lt;script&gt;x&lt;/script&gt;");
	});
});

describe("perkExpiringSoon", () => {
	it("reaches everyone who can view Perks", async () => {
		const backend = convexTest(schema, modules);
		const viewers = await seedEveryone(backend);
		const ids = await backend.run((context) =>
			KINDS.perkExpiringSoon.audience(context, EXPIRING)
		);
		expect(sorted(ids)).toEqual(sorted(viewers));
	});

	it("pushes the perk and its last day, linked to the perk", () => {
		expect(KINDS.perkExpiringSoon.push(EXPIRING, recipient("mo1"))).toEqual(
			{
				title: "Perk ending soon",
				body: "Cloud credits ends on 9 November 2026",
				url: `${SITE}/perks?perk=perk1`,
				tag: "perk-perk1-expiring",
			}
		);
	});
});

describe("perk community dispatch", () => {
	it("keeps a bell row for every member, whatever their email switch", async () => {
		const backend = convexTest(schema, modules);
		const member = await seed(backend, {
			email: "mo@example.com",
			tier: "member",
		});
		const quiet = await seed(backend, {
			email: "quiet@example.com",
			tier: "member",
			notificationPrefs: { perkUpdates: { push: true, email: false } },
		});
		await backend.action(internal.notify.dispatch.run, {
			kind: "perkAdded",
			payload: ADDED,
		});

		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(sorted(rows.map((row) => row.personId))).toEqual(
			sorted([member, quiet])
		);
		expect(rows[0]).toMatchObject({
			kind: "perkAdded",
			title: "New perk",
			body: "Nimbus · Cloud credits",
			url: "/perks?perk=perk1",
		});
	});
});
