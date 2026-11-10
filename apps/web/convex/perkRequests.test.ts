import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { PERK_REQUEST_LIST_CAP, type PerkRequestStatus } from "./lib/perks.ts";
import { TEXT_MAX } from "./lib/validate.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = TestConvex<typeof schema>;
type PersonFields = Partial<
	Pick<
		Doc<"people">,
		"tier" | "firstName" | "lastName" | "venture" | "accessUntil"
	>
>;
type PerkFields = Partial<
	Pick<Doc<"perks">, "title" | "contactId" | "validUntil">
>;

// 11:00 in Zurich on 2026-10-29, so "today" there is 2026-10-29.
const T0 = Date.UTC(2026, 9, 29, 10, 0);
const DAY = 86_400_000;
const REQUESTER = "ada@example.com";
const CONTACT = "cleo@example.com";
const OTHER = "bea@example.com";
const CALLER = "caller@example.com";
const NOTE = "We are a team of four.";

beforeEach(() => {
	// requestPerk schedules a dispatch: fake timers keep it from running after
	// the test, and pin "today" for the expiry checks.
	vi.useFakeTimers();
	vi.setSystemTime(T0);
});

afterEach(() => {
	vi.useRealTimers();
});

/**
 * Seeds run on a clock an hour before T0. convex-test, like Convex, never
 * gives a transaction a time before the last commit, so seeding at T0 would
 * push the function under test to T0 + 1 ms.
 */
async function seeded<T>(work: () => Promise<T>): Promise<T> {
	const now = Date.now();
	vi.setSystemTime(T0 - 3_600_000);
	try {
		return await work();
	} finally {
		vi.setSystemTime(now);
	}
}

async function seedPerson(
	backend: Backend,
	email: string,
	fields: PersonFields = {}
): Promise<Id<"people">> {
	return seeded(() =>
		backend.run((context) =>
			context.db.insert("people", {
				email,
				firstName: "Test",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: T0,
				...fields,
			})
		)
	);
}

async function seedPerk(
	backend: Backend,
	fields: PerkFields = {}
): Promise<Id<"perks">> {
	return seeded(() =>
		backend.run((context) =>
			context.db.insert("perks", {
				partner: "Example Cloud",
				title: "Cloud credits",
				terms: "Credits for the first year.",
				category: "cloud",
				createdAt: T0,
				...fields,
			})
		)
	);
}

/** A board contact, a member with a venture, and a perk the contact owns. */
async function setup() {
	const backend = convexTest(schema, modules);
	const contactId = await seedPerson(backend, CONTACT, {
		tier: "board",
		firstName: "Cleo",
		lastName: "Contact",
	});
	const requesterId = await seedPerson(backend, REQUESTER, {
		firstName: "Ada",
		lastName: "Lovelace",
		venture: { name: "Acme" },
	});
	const perkId = await seedPerk(backend, { contactId });
	return {
		backend,
		contactId,
		requesterId,
		perkId,
		asBoard: backend.withIdentity({ email: CONTACT }),
		asRequester: backend.withIdentity({ email: REQUESTER }),
	};
}

async function requestRows(backend: Backend) {
	return backend.run((context) => context.db.query("perkRequests").collect());
}

async function dispatches(backend: Backend) {
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	return jobs.filter((job) => job.name === "notify/dispatch:run");
}

/** A queued dispatch's argument: which kind, with what payload. */
type DispatchArgs = { kind: string; payload: Record<string, unknown> };

function dispatchArgs(job: { args: unknown[] }): DispatchArgs {
	return job.args[0] as DispatchArgs;
}

async function dispatchesOf(backend: Backend, kind: string) {
	const jobs = await dispatches(backend);
	return jobs.filter((job) => dispatchArgs(job).kind === kind);
}

/** The dispatch payload for the setup's requester and a default-titled perk,
 *  no contact details and no note. No `contactId` key when the perk has no contact. */
function payloadFor(ids: {
	requestId: Id<"perkRequests">;
	perkId: Id<"perks">;
	contactId?: Id<"people">;
}) {
	return {
		...ids,
		perkTitle: "Cloud credits",
		partner: "Example Cloud",
		requesterName: "Ada Lovelace",
	};
}

describe("perkRequests gates", () => {
	it.each(["guest", "member", "core", "board", "admin"] as const)(
		"lets a %s request a perk and read their own open requests",
		async (tier) => {
			const { backend, perkId } = await setup();
			await seedPerson(backend, CALLER, { tier });
			const asCaller = backend.withIdentity({ email: CALLER });
			await asCaller.mutation(api.perkRequests.requestPerk, { perkId });
			expect(
				await asCaller.query(api.perkRequests.myOpenPerkRequests, {})
			).toEqual([{ perkId, requestedAt: T0 }]);
		}
	);

	it("refuses staff on every function", async () => {
		const { backend, perkId, asRequester } = await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		await seedPerson(backend, CALLER, { tier: "staff" });
		const asStaff = backend.withIdentity({ email: CALLER });
		await expect(
			asStaff.mutation(api.perkRequests.requestPerk, { perkId })
		).rejects.toThrow(/Forbidden/);
		await expect(
			asStaff.query(api.perkRequests.myOpenPerkRequests, {})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asStaff.query(api.perkRequests.listPerkRequests, {})
		).rejects.toThrow(/Forbidden/);
		await expect(
			asStaff.query(api.perkRequests.listRequestsForPerk, { perkId })
		).rejects.toThrow(/Forbidden/);
		await expect(
			asStaff.mutation(api.perkRequests.setPerkRequestStatus, {
				requestId,
				status: "granted",
			})
		).rejects.toThrow(/Forbidden/);
		expect(await requestRows(backend)).toEqual([
			expect.objectContaining({ _id: requestId, status: "requested" }),
		]);
	});

	it.each(["guest", "member", "core"] as const)(
		"refuses a %s on the board's functions",
		async (tier) => {
			const { backend, perkId, asRequester } = await setup();
			const requestId = await asRequester.mutation(
				api.perkRequests.requestPerk,
				{ perkId }
			);
			await seedPerson(backend, CALLER, { tier });
			const asCaller = backend.withIdentity({ email: CALLER });
			await expect(
				asCaller.query(api.perkRequests.listPerkRequests, {})
			).rejects.toThrow(/Forbidden/);
			await expect(
				asCaller.query(api.perkRequests.listRequestsForPerk, {
					perkId,
				})
			).rejects.toThrow(/Forbidden/);
			await expect(
				asCaller.mutation(api.perkRequests.setPerkRequestStatus, {
					requestId,
					status: "declined",
				})
			).rejects.toThrow(/Forbidden/);
			expect(await requestRows(backend)).toEqual([
				expect.objectContaining({
					_id: requestId,
					status: "requested",
				}),
			]);
		}
	);

	it.each(["board", "admin"] as const)(
		"lets a %s run the board's functions",
		async (tier) => {
			const { backend, perkId, asRequester } = await setup();
			const requestId = await asRequester.mutation(
				api.perkRequests.requestPerk,
				{ perkId }
			);
			const callerId = await seedPerson(backend, CALLER, { tier });
			const asCaller = backend.withIdentity({ email: CALLER });
			const list = await asCaller.query(
				api.perkRequests.listPerkRequests,
				{}
			);
			expect(list.requests).toHaveLength(1);
			expect(
				await asCaller.query(api.perkRequests.listRequestsForPerk, {
					perkId,
				})
			).toHaveLength(1);
			await asCaller.mutation(api.perkRequests.setPerkRequestStatus, {
				requestId,
				status: "contacted",
			});
			expect(await requestRows(backend)).toEqual([
				expect.objectContaining({
					status: "contacted",
					statusById: callerId,
				}),
			]);
		}
	);

	it("refuses a signed-out caller on every function", async () => {
		const { backend, perkId, asRequester } = await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		await expect(
			backend.mutation(api.perkRequests.requestPerk, { perkId })
		).rejects.toThrow(/NotAuthenticated/);
		await expect(
			backend.query(api.perkRequests.myOpenPerkRequests, {})
		).rejects.toThrow(/NotAuthenticated/);
		await expect(
			backend.query(api.perkRequests.listPerkRequests, {})
		).rejects.toThrow(/NotAuthenticated/);
		await expect(
			backend.query(api.perkRequests.listRequestsForPerk, { perkId })
		).rejects.toThrow(/NotAuthenticated/);
		await expect(
			backend.mutation(api.perkRequests.setPerkRequestStatus, {
				requestId,
				status: "granted",
			})
		).rejects.toThrow(/NotAuthenticated/);
	});

	it("refuses a guest whose window has closed", async () => {
		const { backend, perkId } = await setup();
		await seedPerson(backend, CALLER, {
			tier: "guest",
			accessUntil: T0 - DAY,
		});
		await expect(
			backend
				.withIdentity({ email: CALLER })
				.mutation(api.perkRequests.requestPerk, { perkId })
		).rejects.toThrow(/AccessExpired/);
		expect(await requestRows(backend)).toHaveLength(0);
	});
});

describe("requestPerk", () => {
	it("inserts a requested row and schedules one perkRequested dispatch", async () => {
		const { backend, perkId, requesterId, contactId, asRequester } =
			await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId, note: `  ${NOTE}\n` }
		);
		const rows = await requestRows(backend);
		expect(rows).toEqual([
			expect.objectContaining({
				_id: requestId,
				perkId,
				personId: requesterId,
				requestedAt: T0,
				note: NOTE,
				status: "requested",
				statusAt: T0,
			}),
		]);
		expect(rows[0].statusById).toBeUndefined();
		expect(await dispatches(backend)).toEqual([
			expect.objectContaining({
				args: [
					{
						kind: "perkRequested",
						payload: payloadFor({ requestId, perkId, contactId }),
					},
				],
			}),
		]);
	});

	it("leaves the contact out of the payload when the perk has none", async () => {
		// The kind then falls back to the whole board, so no other id may
		// stand in for the missing contact.
		const { backend, asRequester } = await setup();
		const perkId = await seedPerk(backend);
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		expect(await dispatches(backend)).toEqual([
			expect.objectContaining({
				args: [
					{
						kind: "perkRequested",
						payload: payloadFor({ requestId, perkId }),
					},
				],
			}),
		]);
	});

	it("returns the open request for a duplicate and schedules nothing more", async () => {
		const { backend, perkId, asRequester } = await setup();
		const firstId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		const secondId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId, note: NOTE }
		);
		expect(secondId).toBe(firstId);
		const rows = await requestRows(backend);
		expect(rows).toHaveLength(1);
		// A sent request's note is never added or edited afterwards.
		expect(rows[0].note).toBeUndefined();
		expect(await dispatches(backend)).toHaveLength(1);
	});

	it("counts a contacted request as open", async () => {
		const { backend, perkId, asBoard, asRequester } = await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId,
			status: "contacted",
		});
		expect(
			await asRequester.mutation(api.perkRequests.requestPerk, {
				perkId,
			})
		).toBe(requestId);
		expect(await requestRows(backend)).toHaveLength(1);
		expect(await dispatches(backend)).toHaveLength(1);
	});

	it.each(["granted", "declined"] as const)(
		"takes a new request once the last one is %s",
		async (status) => {
			const { backend, perkId, asBoard, asRequester } = await setup();
			const firstId = await asRequester.mutation(
				api.perkRequests.requestPerk,
				{ perkId }
			);
			await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
				requestId: firstId,
				status,
			});
			const secondId = await asRequester.mutation(
				api.perkRequests.requestPerk,
				{ perkId }
			);
			expect(secondId).not.toBe(firstId);
			const rows = await requestRows(backend);
			expect(rows).toHaveLength(2);
			expect(rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ _id: firstId, status }),
					expect.objectContaining({
						_id: secondId,
						status: "requested",
					}),
				])
			);
			expect(await dispatchesOf(backend, "perkRequested")).toHaveLength(
				2
			);
		}
	);

	it("returns the open request even once the perk has expired", async () => {
		const { backend, asRequester } = await setup();
		const perkId = await seedPerk(backend, { validUntil: "2026-10-29" });
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		// 2026-10-30 in Zurich: the perk ended yesterday.
		vi.setSystemTime(T0 + DAY);
		expect(
			await asRequester.mutation(api.perkRequests.requestPerk, {
				perkId,
			})
		).toBe(requestId);
		expect(await dispatches(backend)).toHaveLength(1);
	});

	it("refuses an expired perk", async () => {
		const { backend, asRequester } = await setup();
		const perkId = await seedPerk(backend, { validUntil: "2026-10-28" });
		await expect(
			asRequester.mutation(api.perkRequests.requestPerk, { perkId })
		).rejects.toThrow(/PerkExpired/);
		expect(await requestRows(backend)).toHaveLength(0);
		expect(await dispatches(backend)).toHaveLength(0);
	});

	it("takes a request on the perk's last valid day", async () => {
		const { backend, asRequester } = await setup();
		const perkId = await seedPerk(backend, { validUntil: "2026-10-29" });
		await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
		expect(await requestRows(backend)).toHaveLength(1);
	});

	it("refuses a perk that no longer exists", async () => {
		const { backend, perkId, asRequester } = await setup();
		await backend.run((context) => context.db.delete(perkId));
		await expect(
			asRequester.mutation(api.perkRequests.requestPerk, { perkId })
		).rejects.toThrow(/PerkNotFound/);
		expect(await requestRows(backend)).toHaveLength(0);
		expect(await dispatches(backend)).toHaveLength(0);
	});

	it("takes a request on a perk with no end date, however late", async () => {
		const { backend, perkId, asRequester } = await setup();
		const later = Date.UTC(2099, 0, 1);
		vi.setSystemTime(later);
		await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
		expect(await requestRows(backend)).toEqual([
			expect.objectContaining({ requestedAt: later }),
		]);
	});

	it("stores no note for a blank one", async () => {
		const { backend, perkId, contactId, asRequester } = await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId, note: " \n\t " }
		);
		const rows = await requestRows(backend);
		expect(rows[0].note).toBeUndefined();
		expect(await dispatches(backend)).toEqual([
			expect.objectContaining({
				args: [
					{
						kind: "perkRequested",
						payload: payloadFor({ requestId, perkId, contactId }),
					},
				],
			}),
		]);
	});

	it("returns the open request for a duplicate with an over-long note: the open check comes first", async () => {
		const { backend, perkId, asRequester } = await setup();
		const firstId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		const secondId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId, note: "n".repeat(TEXT_MAX + 1) }
		);
		expect(secondId).toBe(firstId);
		expect(await requestRows(backend)).toHaveLength(1);
		expect(await dispatches(backend)).toHaveLength(1);
	});

	it("refuses an over-long note", async () => {
		const { backend, perkId, asRequester } = await setup();
		await expect(
			asRequester.mutation(api.perkRequests.requestPerk, {
				perkId,
				note: "n".repeat(TEXT_MAX + 1),
			})
		).rejects.toThrow(/FieldTooLong/);
		expect(await requestRows(backend)).toHaveLength(0);
		expect(await dispatches(backend)).toHaveLength(0);
	});

	it("caps the note after trimming it", async () => {
		const { backend, perkId, asRequester } = await setup();
		const note = "n".repeat(TEXT_MAX);
		await asRequester.mutation(api.perkRequests.requestPerk, {
			perkId,
			note: `  ${note}  `,
		});
		expect(await requestRows(backend)).toEqual([
			expect.objectContaining({ note }),
		]);
	});
});

describe("myOpenPerkRequests", () => {
	it("returns the caller's open requests only, and never a status", async () => {
		const { backend, perkId, asBoard, asRequester } = await setup();
		const contactedPerkId = await seedPerk(backend, {
			title: "Design seats",
		});
		const grantedPerkId = await seedPerk(backend, { title: "Legal hours" });
		await asRequester.mutation(api.perkRequests.requestPerk, {
			perkId,
			note: NOTE,
		});
		const contactedId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId: contactedPerkId }
		);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId: contactedId,
			status: "contacted",
		});
		const grantedId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId: grantedPerkId }
		);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId: grantedId,
			status: "granted",
		});
		await seedPerson(backend, OTHER);
		await backend
			.withIdentity({ email: OTHER })
			.mutation(api.perkRequests.requestPerk, { perkId: grantedPerkId });

		const mine = await asRequester.query(
			api.perkRequests.myOpenPerkRequests,
			{}
		);
		expect(mine).toHaveLength(2);
		expect(mine).toEqual(
			expect.arrayContaining([
				{ perkId, requestedAt: T0, note: NOTE },
				{ perkId: contactedPerkId, requestedAt: T0 },
			])
		);
		for (const request of mine) {
			expect(request).not.toHaveProperty("status");
		}
	});
});

describe("listPerkRequests", () => {
	it("joins the names in, newest first", async () => {
		const { backend, perkId, requesterId, asBoard, asRequester } =
			await setup();
		const adaRequestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId, note: NOTE }
		);
		const beaId = await seedPerson(backend, OTHER, {
			firstName: "Bea",
			lastName: "Example",
		});
		vi.setSystemTime(T0 + 1000);
		const beaRequestId = await backend
			.withIdentity({ email: OTHER })
			.mutation(api.perkRequests.requestPerk, { perkId });
		vi.setSystemTime(T0 + 2000);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId: adaRequestId,
			status: "contacted",
		});

		const list = await asBoard.query(api.perkRequests.listPerkRequests, {});
		expect(list.capped).toBe(false);
		expect(list.requests).toEqual([
			{
				_id: beaRequestId,
				perkId,
				personId: beaId,
				requesterName: "Bea Example",
				requesterEmail: OTHER,
				perkTitle: "Cloud credits",
				partner: "Example Cloud",
				contactName: "Cleo Contact",
				requestedAt: T0 + 1000,
				status: "requested",
				statusAt: T0 + 1000,
			},
			{
				_id: adaRequestId,
				perkId,
				personId: requesterId,
				requesterName: "Ada Lovelace",
				requesterEmail: REQUESTER,
				ventureName: "Acme",
				perkTitle: "Cloud credits",
				partner: "Example Cloud",
				contactName: "Cleo Contact",
				requestedAt: T0,
				note: NOTE,
				status: "contacted",
				statusAt: T0 + 2000,
				statusByName: "Cleo Contact",
			},
		]);
	});

	it("drops a request whose perk or requester is gone", async () => {
		const { backend, perkId, requesterId, asBoard, asRequester } =
			await setup();
		const gonePerkId = await seedPerk(backend, { title: "Design seats" });
		await seedPerson(backend, OTHER);
		const asOther = backend.withIdentity({ email: OTHER });
		await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
		await asOther.mutation(api.perkRequests.requestPerk, {
			perkId: gonePerkId,
		});
		const keptId = await asOther.mutation(api.perkRequests.requestPerk, {
			perkId,
		});
		await backend.run(async (context) => {
			await context.db.delete(requesterId);
			await context.db.delete(gonePerkId);
		});

		const { requests } = await asBoard.query(
			api.perkRequests.listPerkRequests,
			{}
		);
		expect(requests.map((row) => row._id)).toEqual([keptId]);
		const perkRows = await asBoard.query(
			api.perkRequests.listRequestsForPerk,
			{ perkId }
		);
		expect(perkRows.map((row) => row._id)).toEqual([keptId]);
	});
});

/** `count` requests on `perkId`, one second apart; the oldest
 *  `orphans` of them are from a person who is then erased, so the join
 *  drops them. */
async function insertList(
	backend: Backend,
	perkId: Id<"perks">,
	{ count, orphans }: { count: number; orphans: number }
) {
	const goneId = await seedPerson(backend, OTHER);
	const keptId = await seedPerson(backend, CALLER);
	await backend.run(async (context) => {
		for (let index = 0; index < count; index++) {
			const requestedAt = T0 - (count - index) * 1000;
			await context.db.insert("perkRequests", {
				perkId,
				personId: index < orphans ? goneId : keptId,
				requestedAt,
				status: "requested",
				statusAt: requestedAt,
			});
		}
		await context.db.delete(goneId);
	});
}

describe("listPerkRequests cap", () => {
	it("says it is capped when the read fills the cap, even once the join drops rows", async () => {
		const { backend, perkId, asBoard } = await setup();
		await insertList(backend, perkId, {
			count: PERK_REQUEST_LIST_CAP,
			orphans: 1,
		});
		const list = await asBoard.query(api.perkRequests.listPerkRequests, {});
		// One short of the cap once joined, yet older requests may exist.
		expect(list.requests).toHaveLength(PERK_REQUEST_LIST_CAP - 1);
		expect(list.capped).toBe(true);
	});

	it("is not capped one row short of the cap", async () => {
		const { backend, perkId, asBoard } = await setup();
		await insertList(backend, perkId, {
			count: PERK_REQUEST_LIST_CAP - 1,
			orphans: 0,
		});
		const list = await asBoard.query(api.perkRequests.listPerkRequests, {});
		expect(list.requests).toHaveLength(PERK_REQUEST_LIST_CAP - 1);
		expect(list.capped).toBe(false);
	});
});

/** The contact name each board list joins on the setup's one request, once
 *  `change` is applied to the contact: `listPerkRequests`'s row, then
 *  `listRequestsForPerk`'s. Read as a second board member, since the
 *  change may take the contact's own board access away. */
async function contactNamesAfter(change: PersonFields) {
	const { backend, perkId, contactId, asRequester } = await setup();
	await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
	await backend.run((context) => context.db.patch(contactId, change));
	await seedPerson(backend, CALLER, { tier: "board" });
	const asCaller = backend.withIdentity({ email: CALLER });
	const { requests } = await asCaller.query(
		api.perkRequests.listPerkRequests,
		{}
	);
	const perPerk = await asCaller.query(api.perkRequests.listRequestsForPerk, {
		perkId,
	});
	return [...requests, ...perPerk].map((row) =>
		"contactName" in row ? row.contactName : "(absent)"
	);
}

describe("the contact's name on a request row", () => {
	it.each([
		["was demoted to member", { tier: "member" as const }],
		["is out of their access window", { accessUntil: T0 - DAY }],
	])(
		"is left out on both board lists while the contact %s",
		async (_case, change: PersonFields) => {
			expect(await contactNamesAfter(change)).toEqual([
				"(absent)",
				"(absent)",
			]);
		}
	);

	it("names a contact whose access window is still open, on both board lists", async () => {
		expect(await contactNamesAfter({ accessUntil: T0 + DAY })).toEqual([
			"Cleo Contact",
			"Cleo Contact",
		]);
	});
});

describe("listRequestsForPerk", () => {
	it("returns one perk's requests, newest first", async () => {
		const { backend, perkId, asBoard, asRequester } = await setup();
		const noContactPerkId = await seedPerk(backend, {
			title: "Design seats",
		});
		await seedPerson(backend, OTHER);
		const firstId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId: noContactPerkId }
		);
		await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
		vi.setSystemTime(T0 + 1000);
		const secondId = await backend
			.withIdentity({ email: OTHER })
			.mutation(api.perkRequests.requestPerk, {
				perkId: noContactPerkId,
			});

		const rows = await asBoard.query(api.perkRequests.listRequestsForPerk, {
			perkId: noContactPerkId,
		});
		expect(rows.map((row) => row._id)).toEqual([secondId, firstId]);
		expect(rows[1]).toMatchObject({
			perkTitle: "Design seats",
			requesterName: "Ada Lovelace",
			ventureName: "Acme",
		});
		expect(rows[1].contactName).toBeUndefined();
	});
});

describe("setPerkRequestStatus", () => {
	it("stamps the status, its time and who set it", async () => {
		const { backend, perkId, contactId, asBoard, asRequester } =
			await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		vi.setSystemTime(T0 + 5000);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId,
			status: "granted",
		});
		expect(await requestRows(backend)).toEqual([
			expect.objectContaining({
				_id: requestId,
				requestedAt: T0,
				status: "granted",
				statusAt: T0 + 5000,
				statusById: contactId,
			}),
		]);
	});

	it("leaves the row alone when the status does not change", async () => {
		const { backend, contactId, move } = await requested();
		vi.setSystemTime(T0 + 5000);
		await move("granted");
		const [before] = await requestRows(backend);
		const eventsBefore = await perkEvents(backend);
		const jobsBefore = await dispatches(backend);
		vi.setSystemTime(T0 + 6000);
		await move("granted");
		expect(await requestRows(backend)).toEqual([before]);
		expect(await perkEvents(backend)).toEqual(eventsBefore);
		expect(await dispatches(backend)).toEqual(jobsBefore);
		expect(before).toEqual(
			expect.objectContaining({
				status: "granted",
				statusAt: T0 + 5000,
				statusById: contactId,
			})
		);
	});

	it("refuses a request that no longer exists", async () => {
		const { backend, perkId, asBoard, asRequester } = await setup();
		const requestId = await asRequester.mutation(
			api.perkRequests.requestPerk,
			{ perkId }
		);
		await backend.run((context) => context.db.delete(requestId));
		await expect(
			asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
				requestId,
				status: "granted",
			})
		).rejects.toThrow(/PerkRequestNotFound/);
	});
});

function outcomeDispatches(backend: Backend) {
	return dispatchesOf(backend, "perkRequestOutcome");
}

/** {@link setup}, with the requester's request made and a way for the
 *  board to move it. */
async function requested() {
	const seeded = await setup();
	const requestId = await seeded.asRequester.mutation(
		api.perkRequests.requestPerk,
		{ perkId: seeded.perkId }
	);
	async function move(status: PerkRequestStatus) {
		await seeded.asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId,
			status,
		});
	}
	return { ...seeded, requestId, move };
}

describe("setPerkRequestStatus tells the requester", () => {
	it.each(["granted", "declined"] as const)(
		"sends the %s outcome to the requester alone",
		async (outcome) => {
			const { backend, perkId, requesterId, requestId, move } =
				await requested();
			await move(outcome);
			expect(await outcomeDispatches(backend)).toEqual([
				expect.objectContaining({
					args: [
						{
							kind: "perkRequestOutcome",
							payload: {
								requestId,
								perkId,
								personId: requesterId,
								partner: "Example Cloud",
								perkTitle: "Cloud credits",
								outcome,
							},
						},
					],
				}),
			]);
		}
	);

	it("sends nothing for Contacted or Requested", async () => {
		const { backend, move } = await requested();
		await move("contacted");
		await move("requested");
		expect(await outcomeDispatches(backend)).toEqual([]);
	});

	it("sends nothing when the status does not change", async () => {
		const { backend, move } = await requested();
		await move("granted");
		await move("granted");
		expect(await outcomeDispatches(backend)).toHaveLength(1);
	});

	it("sends again each time the request lands on a different answer", async () => {
		const { backend, move } = await requested();
		await move("granted");
		await move("declined");
		await move("contacted");
		await move("declined");
		const outcomes = await outcomeDispatches(backend);
		expect(
			outcomes.map((job) => dispatchArgs(job).payload.outcome)
		).toEqual(["granted", "declined", "declined"]);
	});
});

async function perkEvents(backend: Backend) {
	const rows = await backend.run((context) =>
		context.db
			.query("personEvents")
			.withIndex("by_kind_and_at", (range) => range.eq("kind", "perk"))
			.collect()
	);
	return rows.map(
		({ personId, actorId, event, perkRequestId, meta, at }) => ({
			personId,
			actorId,
			event,
			perkRequestId,
			meta: meta as { perkId: Id<"perks"> },
			at,
		})
	);
}

describe("perk request history events", () => {
	it("writes one requested event, with the requester as actor, for a new request", async () => {
		const { backend, perkId, requesterId, requestId } = await requested();
		expect(await perkEvents(backend)).toEqual([
			{
				personId: requesterId,
				actorId: requesterId,
				event: "requested",
				perkRequestId: requestId,
				meta: { perkId },
				at: T0,
			},
		]);
	});

	it("writes nothing when the request is answered with the open one", async () => {
		const { backend, perkId, asRequester } = await requested();
		await asRequester.mutation(api.perkRequests.requestPerk, { perkId });
		expect(await perkEvents(backend)).toHaveLength(1);
	});

	it("writes one event per real status change, with the board member as actor", async () => {
		const { backend, perkId, requesterId, contactId, requestId, move } =
			await requested();
		vi.setSystemTime(T0 + 5000);
		await move("contacted");
		vi.setSystemTime(T0 + 6000);
		await move("contacted");
		const events = await perkEvents(backend);
		expect(events.filter((row) => row.event === "contacted")).toEqual([
			{
				personId: requesterId,
				actorId: contactId,
				event: "contacted",
				perkRequestId: requestId,
				meta: { perkId },
				at: T0 + 5000,
			},
		]);
		expect(events).toHaveLength(2);
	});
});

describe("a request with no events of its own", () => {
	it("logs only the move: its past is backfillPerkEvents' to write", async () => {
		const { backend, perkId, requesterId, contactId, asBoard } =
			await setup();
		const requestId = await backend.run((context) =>
			context.db.insert("perkRequests", {
				perkId,
				personId: requesterId,
				requestedAt: T0 - 2 * DAY,
				status: "contacted",
				statusAt: T0 - DAY,
				statusById: contactId,
			})
		);
		await asBoard.mutation(api.perkRequests.setPerkRequestStatus, {
			requestId,
			status: "granted",
		});
		expect(await perkEvents(backend)).toEqual([
			{
				personId: requesterId,
				actorId: contactId,
				event: "granted",
				perkRequestId: requestId,
				meta: { perkId },
				at: T0,
			},
		]);
	});
});

describe("getPerkRequest", () => {
	it.each(["guest", "member", "core", "staff"] as const)(
		"refuses a %s",
		async (tier) => {
			const { backend, requestId } = await requested();
			await seedPerson(backend, CALLER, { tier });
			const asCaller = backend.withIdentity({ email: CALLER });
			await expect(
				asCaller.query(api.perkRequests.getPerkRequest, { requestId })
			).rejects.toThrow(/Forbidden/);
			await expect(
				asCaller.query(api.perkRequests.perkRequestHistory, {
					requestId,
				})
			).rejects.toThrow(/Forbidden/);
		}
	);

	it("refuses a signed-out caller", async () => {
		const { backend, requestId } = await requested();
		await expect(
			backend.query(api.perkRequests.getPerkRequest, { requestId })
		).rejects.toThrow(/NotAuthenticated/);
		await expect(
			backend.query(api.perkRequests.perkRequestHistory, { requestId })
		).rejects.toThrow(/NotAuthenticated/);
	});

	it("returns the board one request with its names joined in", async () => {
		const { asBoard, perkId, requesterId, requestId, move } =
			await requested();
		await move("contacted");
		expect(
			await asBoard.query(api.perkRequests.getPerkRequest, { requestId })
		).toEqual({
			_id: requestId,
			perkId,
			personId: requesterId,
			requesterName: "Ada Lovelace",
			requesterEmail: REQUESTER,
			ventureName: "Acme",
			perkTitle: "Cloud credits",
			partner: "Example Cloud",
			contactName: "Cleo Contact",
			requestedAt: T0,
			status: "contacted",
			statusAt: T0,
			statusByName: "Cleo Contact",
		});
	});

	it("returns null for an id that is not a perk request's", async () => {
		const { asBoard, perkId } = await requested();
		for (const requestId of ["not-an-id", perkId])
			expect(
				await asBoard.query(api.perkRequests.getPerkRequest, {
					requestId,
				})
			).toBeNull();
	});

	it("returns null once the request or its perk is gone", async () => {
		const { backend, asBoard, perkId, requestId } = await requested();
		await backend.run((context) => context.db.delete(perkId));
		expect(
			await asBoard.query(api.perkRequests.getPerkRequest, { requestId })
		).toBeNull();
		await backend.run((context) => context.db.delete(requestId));
		expect(
			await asBoard.query(api.perkRequests.getPerkRequest, { requestId })
		).toBeNull();
	});
});

describe("perkRequestHistory", () => {
	it("returns the request's own events, newest first, for the board", async () => {
		const {
			backend,
			asBoard,
			perkId,
			contactId,
			requesterId,
			requestId,
			move,
		} = await requested();
		vi.setSystemTime(T0 + 5000);
		await move("granted");
		// Another request by someone else stays out of this one's history.
		await seedPerson(backend, OTHER);
		await backend
			.withIdentity({ email: OTHER })
			.mutation(api.perkRequests.requestPerk, { perkId });
		const history = await asBoard.query(
			api.perkRequests.perkRequestHistory,
			{ requestId }
		);
		expect(
			history.map((entry) => [
				entry.kind,
				entry.kind === "perk" ? entry.event : undefined,
				entry.actorId,
			])
		).toEqual([
			["perk", "granted", contactId],
			["perk", "requested", requesterId],
		]);
	});
});
