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
	const withContact = { ...REQUEST, contactId: CONTACT };

	it("pushes who asked for what, linked to the request", () => {
		expect(
			KINDS.perkRequested.push(withContact, recipient(CONTACT))
		).toEqual({
			title: "Perk requested",
			body: "Ada Lovelace requested Cloud credits (Nimbus)",
			url: `${SITE}/perks?tab=requests&request=request1`,
			tag: "perk-request-request1",
		});
	});
});

describe("perkRequested dispatch", () => {
	it("reaches the contact's bell (no instant email), not the rest of the board", async () => {
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

		// No device, and a digest kind sends no instant email: nothing goes out.
		expect(result).toEqual({ recipients: 1, delivered: 0, failed: 0 });
		expect(emails()).toEqual([]);
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

	it("keeps the bell row for a contact who switched perks email off", async () => {
		const backend = convexTest(schema, modules);
		const contact = await seed(backend, {
			email: "anna@example.com",
			tier: "board",
			notificationPrefs: { perks: { push: true, email: false } },
		});
		const result = await backend.action(internal.notify.dispatch.run, {
			kind: "perkRequested",
			payload: { ...REQUEST, contactId: contact },
		});

		expect(result).toEqual({ recipients: 1, delivered: 0, failed: 0 });
		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(rows.map((row) => row.personId)).toEqual([contact]);
	});
});
