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
	return Promise.all(raws.map(hashConfirmToken));
}

async function seedPerson(
	t: ReturnType<typeof convexTest>,
	tier: "prospect" | "visitor" | "member" = "prospect"
) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
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
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			await issueToken(ctx, {
				token: "t2",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const rows = await ctx.db.query("confirmTokens").collect();
			expect(rows.map((r) => r.tokenHash)).toEqual(await hashes(["t2"]));
		});
	});

	it("keeps invites to two events apart", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			const a = await ctx.db.insert("events", {
				name: "A",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 0,
			});
			const b = await ctx.db.insert("events", {
				name: "B",
				startsAt: 0,
				endsAt: 1,
				startsAtLocal: "2026-01-01T00:00:00+01:00[Europe/Zurich]",
				endsAtLocal: "2026-01-01T01:00:00+01:00[Europe/Zurich]",
				createdBy: personId,
				createdAt: 0,
			});
			await issueToken(ctx, {
				token: "ia",
				purpose: "eventInvite",
				personId,
				eventId: a,
				ttlMs: HOUR,
			});
			await issueToken(ctx, {
				token: "ib",
				purpose: "eventInvite",
				personId,
				eventId: b,
				ttlMs: HOUR,
			});
			await issueToken(ctx, {
				token: "ia2",
				purpose: "eventInvite",
				personId,
				eventId: a,
				ttlMs: HOUR,
			});
			const rows = await ctx.db.query("confirmTokens").collect();
			expect(rows.map((r) => r.tokenHash).sort()).toEqual(
				(await hashes(["ia2", "ib"])).sort()
			);
			const live = await liveTokens(
				ctx.db,
				personId,
				"eventInvite",
				Date.now()
			);
			expect(live.map((r) => r.tokenHash).sort()).toEqual(
				(await hashes(["ia2", "ib"])).sort()
			);
		});
	});

	it("redeems once, then says already; wrong purpose is invalid", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect((await redeemToken(ctx, "t1", "visitor")).status).toBe(
				"invalid"
			);
			expect((await redeemToken(ctx, "nope", "application")).status).toBe(
				"invalid"
			);
			const first = await redeemToken(ctx, "t1", "application");
			expect(first.status).toBe("ok");
			expect((await redeemToken(ctx, "t1", "application")).status).toBe(
				"already"
			);
		});
	});

	it("reports expired and purges past expiry", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "old",
				purpose: "application",
				personId,
				ttlMs: -1,
			});
			expect((await redeemToken(ctx, "old", "application")).status).toBe(
				"expired"
			);
			expect(
				await liveTokens(ctx.db, personId, "application", Date.now())
			).toEqual([]);
			expect(await purgeConfirmTokens(ctx, Date.now(), BATCH)).toBe(1);
			expect(await ctx.db.query("confirmTokens").collect()).toHaveLength(
				0
			);
		});
	});

	it("abandoned = unverified self-serve row with no live token", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			const person = (await ctx.db.get(personId))!;
			expect(await abandoned(ctx.db, person, Date.now())).toBe(true);
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(ctx.db, person, Date.now())).toBe(false);
		});
	});

	it("refuses an event invite without an event", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await expect(
				issueToken(ctx, {
					token: "i",
					purpose: "eventInvite",
					personId,
					ttlMs: HOUR,
				})
			).rejects.toThrow("eventInvite tokens need an eventId");
		});
	});

	it("round-trips a staged payload", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		const payload = {
			firstName: "Ada",
			lastName: "Lovelace",
			phone: "+1 555 0100",
			vertical: ["ai" as const],
			venture: { name: "Engines", whyJoin: "Compute" },
			submittedAt: 1,
		};
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "p",
				purpose: "application",
				personId,
				ttlMs: HOUR,
				payload,
			});
			const redeemed = await redeemToken(ctx, "p", "application");
			expect(redeemed.status).toBe("ok");
			if (redeemed.status === "ok")
				expect(redeemed.row.payload).toEqual(payload);
		});
	});

	it("re-issues after a consumed row and keeps the consumed row", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			await redeemToken(ctx, "t1", "application");
			await issueToken(ctx, {
				token: "t2",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const rows = await ctx.db.query("confirmTokens").collect();
			expect(rows.map((r) => r.tokenHash).sort()).toEqual(
				(await hashes(["t1", "t2"])).sort()
			);
			expect(
				(
					await liveTokens(
						ctx.db,
						personId,
						"application",
						Date.now()
					)
				).map((r) => r.tokenHash)
			).toEqual(await hashes(["t2"]));
			expect((await redeemToken(ctx, "t1", "application")).status).toBe(
				"already"
			);
		});
	});

	it("abandoned reads the visitor token for a visitor", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t, "visitor");
		await t.run(async (ctx) => {
			const person = (await ctx.db.get(personId))!;
			await issueToken(ctx, {
				token: "a",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(ctx.db, person, Date.now())).toBe(true);
			await issueToken(ctx, {
				token: "v",
				purpose: "visitor",
				personId,
				ttlMs: HOUR,
			});
			expect(await abandoned(ctx.db, person, Date.now())).toBe(false);
		});
	});

	it("never calls a non-self-serve tier abandoned", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t, "member");
		await t.run(async (ctx) => {
			const person = (await ctx.db.get(personId))!;
			expect(await abandoned(ctx.db, person, Date.now())).toBe(false);
		});
	});

	it("purges at most one batch of expired rows per call", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			for (let i = 0; i <= BATCH; i++) {
				await ctx.db.insert("confirmTokens", {
					tokenHash: `x${i}`,
					purpose: "application",
					personId,
					expiresAt: 1,
				});
			}
			expect(await purgeConfirmTokens(ctx, Date.now(), BATCH)).toBe(
				BATCH
			);
			expect(await ctx.db.query("confirmTokens").collect()).toHaveLength(
				1
			);
		});
	});
});

describe("tokenRow and redeemRow", () => {
	it("tokenRow finds an issued token and null for an unknown one", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			expect((await tokenRow(ctx.db, "t1"))?.tokenHash).toBe(
				await hashConfirmToken("t1")
			);
			expect(await tokenRow(ctx.db, "nope")).toBeNull();
		});
	});

	it("redeemRow consumes the row it is given", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const ok = await redeemRow(
				ctx,
				await tokenRow(ctx.db, "t1"),
				"application"
			);
			expect(ok.status).toBe("ok");
			expect((await tokenRow(ctx.db, "t1"))?.consumedAt).toEqual(
				expect.any(Number)
			);
		});
	});
});

describe("newConfirmToken", () => {
	it("returns a 64-char hex string", () => {
		expect(newConfirmToken()).toMatch(/^[0-9a-f]{64}$/);
	});
	it("is unique across calls", () => {
		const a = newConfirmToken();
		const b = newConfirmToken();
		expect(a).not.toBe(b);
	});
});

describe("hashed storage", () => {
	it("stores only a sha256 hex of the token, never the raw token", async () => {
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		const raw = newConfirmToken();
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: raw,
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const [row] = await ctx.db.query("confirmTokens").collect();
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
		const t = convexTest(schema, modules);
		const personId = await seedPerson(t);
		await t.run(async (ctx) => {
			await issueToken(ctx, {
				token: "t1",
				purpose: "application",
				personId,
				ttlMs: HOUR,
			});
			const [row] = await ctx.db.query("confirmTokens").collect();
			const stored = row.tokenHash;
			expect(stored).not.toBe("");
			expect(await tokenRow(ctx.db, stored)).toBeNull();
			expect((await redeemToken(ctx, stored, "application")).status).toBe(
				"invalid"
			);
			expect((await redeemToken(ctx, "t1", "application")).status).toBe(
				"ok"
			);
		});
	});
});
