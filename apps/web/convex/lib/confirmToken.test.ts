import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema.ts";

import {
	abandoned,
	hashConfirmToken,
	issueToken,
	liveTokens,
	newConfirmToken,
	purgeConfirmTokens,
	redeemRow,
	redeemToken,
	tokenRow,
} from "./confirmToken.ts";

const modules = import.meta.glob("../**/*.*s");
const HOUR = 3_600_000;
const BATCH = 3;

async function hashes(raws: string[]): Promise<string[]> {
	return Promise.all(raws.map((raw) => hashConfirmToken(raw)));
}

function sortedStrings(values: string[]): string[] {
	return values.toSorted((first, second) => first.localeCompare(second));
}

async function seedPerson(
	backend: ReturnType<typeof convexTest>,
	tier: "prospect" | "visitor" | "member" = "prospect"
) {
	return backend.run((context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "",
			tier,
			stage: "unverified",
			stageSince: 0,
		})
	);
}

describe("confirmToken", () => {
	it("issues one live token per person and purpose", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			await issueToken(context, {
				token: "t2",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const rows = await context.db.query("confirmTokens").collect();
			expect(rows.map((row) => row.tokenHash)).toEqual(
				await hashes(["t2"])
			);
		});
	});

	it("keeps invites to two events apart", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			const firstEvent = await context.db.insert("events", {
				name: "A",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 0,
			});
			const secondEvent = await context.db.insert("events", {
				name: "B",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 0,
			});
			await issueToken(context, {
				token: "ia",
				purpose: "eventInvite",
				personId,
				eventId: firstEvent,
				ttlMs: HOUR,
			});
			await issueToken(context, {
				token: "ib",
				purpose: "eventInvite",
				personId,
				eventId: secondEvent,
				ttlMs: HOUR,
			});
			await issueToken(context, {
				token: "ia2",
				purpose: "eventInvite",
				personId,
				eventId: firstEvent,
				ttlMs: HOUR,
			});
			const rows = await context.db.query("confirmTokens").collect();
			const expectedInviteHashes = await hashes(["ia2", "ib"]);
			expect(sortedStrings(rows.map((row) => row.tokenHash))).toEqual(
				sortedStrings(expectedInviteHashes)
			);
			const live = await liveTokens(
				context.db,
				personId,
				"eventInvite",
				Date.now()
			);
			expect(sortedStrings(live.map((row) => row.tokenHash))).toEqual(
				sortedStrings(expectedInviteHashes)
			);
		});
	});

	it("redeems once, then says already; wrong purpose is invalid", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const wrongPurpose = await redeemToken(context, "t1", "visitor");
			expect(wrongPurpose.status).toBe("invalid");
			const unknownToken = await redeemToken(
				context,
				"nope",
				"application"
			);
			expect(unknownToken.status).toBe("invalid");
			const first = await redeemToken(context, "t1", "application");
			expect(first.status).toBe("ok");
			const repeat = await redeemToken(context, "t1", "application");
			expect(repeat.status).toBe("already");
		});
	});

	it("reports expired and purges past expiry", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "old",
				purpose: "application",
				personId,
				ttlMs: -1,
			});
			const redeemed = await redeemToken(context, "old", "application");
			expect(redeemed.status).toBe("expired");
			expect(
				await liveTokens(
					context.db,
					personId,
					"application",
					Date.now()
				)
			).toEqual([]);
			expect(await purgeConfirmTokens(context, Date.now(), BATCH)).toBe(
				1
			);
			expect(
				await context.db.query("confirmTokens").collect()
			).toHaveLength(0);
		});
	});

	it("abandoned = unverified self-serve row with no live token", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			const person = (await context.db.get(personId))!;
			expect(await abandoned(context.db, person, Date.now())).toBe(true);
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(context.db, person, Date.now())).toBe(false);
		});
	});

	it("refuses an event invite without an event", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await expect(
				issueToken(context, {
					token: "i",
					purpose: "eventInvite",
					personId,
					ttlMs: HOUR,
				})
			).rejects.toThrow("eventInvite tokens need an eventId");
		});
	});

	it("round-trips a staged payload", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		const payload = {
			firstName: "Ada",
			lastName: "Lovelace",
			phone: "+1 555 0100",
			vertical: ["ai" as const],
			venture: { name: "Engines", whyJoin: "Compute" },
			submittedAt: 1,
		};
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "p",
				purpose: "application",
				personId,
				ttlMs: HOUR,
				payload,
			});
			const redeemed = await redeemToken(context, "p", "application");
			expect(redeemed.status).toBe("ok");
			if (redeemed.status === "ok")
				expect(redeemed.row.payload).toEqual(payload);
		});
	});

	it("re-issues after a consumed row and keeps the consumed row", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			await redeemToken(context, "t1", "application");
			await issueToken(context, {
				token: "t2",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const rows = await context.db.query("confirmTokens").collect();
			expect(sortedStrings(rows.map((row) => row.tokenHash))).toEqual(
				sortedStrings(await hashes(["t1", "t2"]))
			);
			const live = await liveTokens(
				context.db,
				personId,
				"application",
				Date.now()
			);
			expect(live.map((row) => row.tokenHash)).toEqual(
				await hashes(["t2"])
			);
			const repeat = await redeemToken(context, "t1", "application");
			expect(repeat.status).toBe("already");
		});
	});

	it("abandoned reads the visitor token for a visitor", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend, "visitor");
		await backend.run(async (context) => {
			const person = (await context.db.get(personId))!;
			await issueToken(context, {
				token: "a",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(context.db, person, Date.now())).toBe(true);
			await issueToken(context, {
				token: "v",
				purpose: "visitor",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(context.db, person, Date.now())).toBe(false);
		});
	});

	it("never calls a non-self-serve tier abandoned", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend, "member");
		await backend.run(async (context) => {
			const person = (await context.db.get(personId))!;
			expect(await abandoned(context.db, person, Date.now())).toBe(false);
		});
	});

	it("purges at most one batch of expired rows per call", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			for (let index = 0; index <= BATCH; index++) {
				await context.db.insert("confirmTokens", {
					tokenHash: `x${index}`,
					purpose: "application",
					personId,
					expiresAt: 1,
				});
			}
			expect(await purgeConfirmTokens(context, Date.now(), BATCH)).toBe(
				BATCH
			);
			expect(
				await context.db.query("confirmTokens").collect()
			).toHaveLength(1);
		});
	});
});

describe("tokenRow and redeemRow", () => {
	it("tokenRow finds an issued token and null for an unknown one", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const row = await tokenRow(context.db, "t1");
			expect(row?.tokenHash).toBe(await hashConfirmToken("t1"));
			expect(await tokenRow(context.db, "nope")).toBeNull();
		});
	});

	it("redeemRow consumes the row it is given", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const ok = await redeemRow(
				context,
				await tokenRow(context.db, "t1"),
				"application"
			);
			expect(ok.status).toBe("ok");
			const consumed = await tokenRow(context.db, "t1");
			expect(consumed?.consumedAt).toEqual(expect.any(Number));
		});
	});
});

describe("newConfirmToken", () => {
	it("returns a 64-char hex string", () => {
		expect(newConfirmToken()).toMatch(/^[0-9a-f]{64}$/);
	});
	it("is unique across calls", () => {
		const first = newConfirmToken();
		const second = newConfirmToken();
		expect(first).not.toBe(second);
	});
});

describe("hashed storage", () => {
	it("stores only a sha256 hex of the token, never the raw token", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		const raw = newConfirmToken();
		await backend.run(async (context) => {
			await issueToken(context, {
				token: raw,
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const [row] = await context.db.query("confirmTokens").collect();
			expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
			expect(row.tokenHash).not.toBe(raw);
			expect(row.tokenHash).toBe(await hashConfirmToken(raw));
		});
	});

	it("hashConfirmToken is sha256 hex", async () => {
		expect(await hashConfirmToken("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});

	it("redeems by the raw token, never by the stored hash", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seedPerson(backend);
		await backend.run(async (context) => {
			await issueToken(context, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const [row] = await context.db.query("confirmTokens").collect();
			const stored = row.tokenHash;
			expect(stored).not.toBe("");
			expect(await tokenRow(context.db, stored)).toBeNull();
			const byHash = await redeemToken(context, stored, "application");
			expect(byHash.status).toBe("invalid");
			const byRaw = await redeemToken(context, "t1", "application");
			expect(byRaw.status).toBe("ok");
		});
	});
});
