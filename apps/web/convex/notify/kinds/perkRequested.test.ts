import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema.ts";
import { KINDS, type PayloadOf } from "../registry.ts";
import type { Recipient } from "../types.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const DAY = 86_400_000;
const SITE = "https://app.example.com";

type Backend = ReturnType<typeof convexTest>;

type Seed = {
	email: string;
	tier: "member" | "board" | "admin";
	accessUntil?: number;
	notificationPrefs?: { perks?: { push: boolean; email: boolean } };
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

function recipient(personId: Id<"people">, firstName = "Anna"): Recipient {
	return {
		personId,
		email: `${firstName}@example.com`,
		firstName,
		tier: "board",
		prefs: undefined,
	};
}

function sorted(ids: string[]): string[] {
	// eslint-disable-next-line id-length -- conventional comparator parameter names
	return [...ids].sort((a, b) => a.localeCompare(b));
}

function captureLogs(): () => string[] {
	const spy = vi.spyOn(console, "log").mockImplementation(() => {});
	return () =>
		spy.mock.calls
			.map((call) => String(call[0]))
			.filter((line) => line.startsWith("[notify:"));
}

const CONTACT = "contact1" as Id<"people">;

const REQUEST = {
	requestId: "request1" as Id<"perkRequests">,
	perkId: "perk1" as Id<"perks">,
	perkTitle: "Cloud credits",
	partner: "Nimbus",
	requesterName: "Ada Lovelace",
	requesterEmail: "ada@example.com",
} satisfies PayloadOf<"perkRequested">;

function audienceOf(
	backend: Backend,
	contactId?: Id<"people">
): Promise<Id<"people">[]> {
	return backend.run((context) =>
		KINDS.perkRequested.audience(context, { ...REQUEST, contactId })
	);
}

beforeEach(() => {
	vi.stubEnv("SITE_URL", SITE);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("perkRequested audience", () => {
	it.each(["board", "admin"] as const)(
		"is the %s contact alone while they are entitled",
		async (tier) => {
			const backend = convexTest(schema, modules);
			const contact = await seed(backend, {
				email: "anna@example.com",
				tier,
			});
			await seed(backend, { email: "bo@example.com", tier: "board" });
			expect(await audienceOf(backend, contact)).toEqual([contact]);
		}
	);

	it("is every entitled board member and admin when the perk has no contact", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "bo@example.com",
			tier: "board",
		});
		const admin = await seed(backend, {
			email: "cy@example.com",
			tier: "admin",
		});
		await seed(backend, { email: "mo@example.com", tier: "member" });
		await seed(backend, {
			email: "late@example.com",
			tier: "board",
			accessUntil: Date.now() - DAY,
		});
		expect(sorted(await audienceOf(backend))).toEqual(
			sorted([board, admin])
		);
	});

	it("falls back to the board when the contact's row is gone", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "bo@example.com",
			tier: "board",
		});
		const erased = await seed(backend, {
			email: "anna@example.com",
			tier: "board",
		});
		await backend.run((context) => context.db.delete(erased));
		expect(await audienceOf(backend, erased)).toEqual([board]);
	});

	it("falls back to the board when the contact was demoted to member", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "bo@example.com",
			tier: "board",
		});
		const demoted = await seed(backend, {
			email: "anna@example.com",
			tier: "member",
		});
		expect(await audienceOf(backend, demoted)).toEqual([board]);
	});

	it("falls back to the board when the contact's access window has closed", async () => {
		const backend = convexTest(schema, modules);
		const board = await seed(backend, {
			email: "bo@example.com",
			tier: "board",
		});
		const lapsed = await seed(backend, {
			email: "anna@example.com",
			tier: "board",
			accessUntil: Date.now() - DAY,
		});
		expect(await audienceOf(backend, lapsed)).toEqual([board]);
	});
});

describe("perkRequested messages", () => {
	const withNote = {
		...REQUEST,
		contactId: CONTACT,
		ventureName: "Acme",
		note: "Could you introduce us this week?",
	};

	it("pushes who asked for what, linked to the request, and never the note", () => {
		expect(KINDS.perkRequested.push(withNote, recipient(CONTACT))).toEqual({
			title: "Perk requested",
			body: "Ada Lovelace requested Cloud credits (Nimbus)",
			url: `${SITE}/perks?tab=requests&request=request1`,
			tag: "perk-request-request1",
		});
	});

	it("emails the contact who asked, from where, with their note", () => {
		const email = KINDS.perkRequested.email?.(withNote, recipient(CONTACT));
		expect(email?.subject).toBe(
			"Ada Lovelace requested a perk: Cloud credits"
		);
		// The plain-text part wraps at 80 columns: compare it unwrapped.
		expect(email?.text.replaceAll(/\s+/g, " ")).toContain(
			"Hi Anna, Ada Lovelace (ada@example.com, Acme) requested Cloud credits from Nimbus. You're the contact for this perk."
		);
		// The note stands between the sentence and the button, a blank line
		// either side.
		expect(email?.text).toContain(
			"You're the contact for this perk.\n\nTheir note: Could you introduce us this week?\n\nView the request"
		);
		expect(email?.html).toContain("View the request");
		expect(email?.html).toContain(
			`href="${SITE}/perks?tab=requests&amp;request=request1"`
		);
		expect(email?.html).toContain(`${SITE}/?notifications=open`);
	});

	it("tells a board member standing in for a missing contact why they got it", () => {
		const email = KINDS.perkRequested.email?.(
			withNote,
			recipient("board1" as Id<"people">, "Bo")
		);
		expect(email?.text).toContain("Hi Bo,");
		expect(email?.text).toContain(
			"The perk has no active contact, so this goes to the whole board."
		);
		expect(email?.text).not.toContain("You're the contact");
	});

	it("leaves the venture out of the requester line when they have none", () => {
		const email = KINDS.perkRequested.email?.(
			{ ...REQUEST, contactId: CONTACT },
			recipient(CONTACT)
		);
		expect(email?.text).toContain("Ada Lovelace (ada@example.com)");
	});

	it("has no note block when the member left no note", () => {
		const email = KINDS.perkRequested.email?.(
			{ ...REQUEST, contactId: CONTACT },
			recipient(CONTACT)
		);
		expect(email?.html).not.toContain("Their note");
		expect(email?.text).not.toContain("Their note");
		// Nothing stands in for it: no empty box, no extra blank line.
		expect(email?.html).not.toMatch(/<div[^>]*>\s*<\/div>/);
		expect(email?.text).toContain(
			"You're the contact for this perk.\n\nView the request"
		);
	});

	it("escapes markup the requester typed in their name, venture and note", () => {
		const email = KINDS.perkRequested.email?.(
			{
				...REQUEST,
				contactId: CONTACT,
				requesterName: "<script>alert(1)</script>",
				ventureName: "<b>Acme</b>",
				note: "<script>alert(2)</script>",
			},
			recipient(CONTACT)
		);
		expect(email?.html).not.toContain("<script>");
		expect(email?.html).not.toContain("<b>Acme");
		expect(email?.html).toContain(
			"&lt;script&gt;alert(1)&lt;/script&gt; (ada@example.com, &lt;b&gt;Acme&lt;/b&gt;)"
		);
		expect(email?.html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
		// The plain-text part is never entity-encoded.
		expect(email?.text).toContain("Their note: <script>alert(2)</script>");
	});
});

describe("perkRequested dispatch", () => {
	it("reaches the contact's email and bell, not the rest of the board", async () => {
		const backend = convexTest(schema, modules);
		const contact = await seed(backend, {
			email: "anna@example.com",
			tier: "board",
		});
		await seed(backend, { email: "bo@example.com", tier: "board" });
		const emails = captureLogs();

		const result = await backend.action(internal.notify.dispatch.run, {
			kind: "perkRequested",
			payload: { ...REQUEST, contactId: contact },
		});

		// No device: the email is the one delivery.
		expect(result).toEqual({ recipients: 1, delivered: 1, failed: 0 });
		expect(emails()).toEqual([
			"[notify:perkRequested] anna@example.com: Ada Lovelace requested a perk: Cloud credits",
		]);
		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(rows).toEqual([
			expect.objectContaining({
				personId: contact,
				kind: "perkRequested",
				title: "Perk requested",
				body: "Ada Lovelace requested Cloud credits (Nimbus)",
				url: "/perks?tab=requests&request=request1",
			}),
		]);
	});

	it("sends no email to a contact who switched perks email off, but keeps the bell row", async () => {
		const backend = convexTest(schema, modules);
		const contact = await seed(backend, {
			email: "anna@example.com",
			tier: "board",
			notificationPrefs: { perks: { push: true, email: false } },
		});
		const emails = captureLogs();

		const result = await backend.action(internal.notify.dispatch.run, {
			kind: "perkRequested",
			payload: { ...REQUEST, contactId: contact },
		});

		expect(result).toEqual({ recipients: 1, delivered: 0, failed: 0 });
		expect(emails()).toEqual([]);
		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(rows.map((row) => row.personId)).toEqual([contact]);
	});
});
