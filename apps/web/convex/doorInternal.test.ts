/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("doorInternal.doorActionContext", () => {
	const EMAIL = "board@example.com";

	async function seed(
		t: ReturnType<typeof convexTest>,
		fields: Record<string, unknown>
	) {
		return t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: EMAIL,
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				...fields,
			})
		);
	}

	it("returns the caller for an active board member", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toEqual({
			email: EMAIL,
			name: "Bo Ard",
			personId,
			lastSameActionUntil: undefined,
		});
	});

	it("admits admin like board", async () => {
		const t = convexTest(schema, modules);
		await seed(t, { tier: "admin" });
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).not.toBeNull();
	});

	it.each(["member", "core", "guest"] as const)(
		"returns the caller for an active %s — app unlock is for everyone the door is open for",
		async (tier) => {
			const t = convexTest(schema, modules);
			const personId = await seed(t, { tier });
			expect(
				await t
					.withIdentity({ email: EMAIL })
					.query(internal.doorInternal.doorActionContext, {
						lock: "downstairs",
						action: "unlock",
					})
			).toEqual({
				email: EMAIL,
				name: "Bo Ard",
				personId,
				lastSameActionUntil: undefined,
			});
		}
	);

	it("admits a guest inside their access window", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {
			tier: "guest",
			accessFrom: Date.now() - 86_400_000,
			accessUntil: Date.now() + 86_400_000,
		});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).not.toBeNull();
	});

	it("refuses a guest whose access window has closed", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {
			tier: "guest",
			stage: "expired",
			accessUntil: Date.now() - 1000,
		});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a member the door is forced shut for", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {
			tier: "member",
			door: { override: "force_off", reason: "test" },
		});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a prospect (not a tier the door is open for)", async () => {
		const t = convexTest(schema, modules);
		await seed(t, { tier: "prospect", stage: "verified" });
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a board member the door is forced shut for", async () => {
		const t = convexTest(schema, modules);
		await seed(t, { door: { override: "force_off", reason: "test" } });
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses an unauthenticated caller", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {});
		expect(
			await t.query(internal.doorInternal.doorActionContext, {
				lock: "downstairs",
				action: "unlock",
			})
		).toBeNull();
	});

	it("reports the latest SUCCESSFUL unlock of THIS door only", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		const base = {
			trigger: "app" as const,
			email: EMAIL,
			name: "Bo Ard",
			personId,
			lockNames: ["Upstairs"],
		};
		await t.run(async (ctx) => {
			// The successful unlock this test proves is picked up.
			await ctx.db.insert("doorLog", {
				...base,
				at: 1_000,
				operation: "unlock",
				outcome: "ok",
				slot: "upstairs",
				durationMs: 3_000,
			});
			// A FAILED unlock of the same door — still carries `slot` (every
			// unlock row does), so this row proves the `outcome: "ok"` filter
			// still matters, not just the `slot` filter.
			await ctx.db.insert("doorLog", {
				...base,
				at: 2_000,
				operation: "unlock",
				outcome: "failed",
				slot: "upstairs",
				detail: "offline",
			});
			// A same-person, ok-outcome GRANT row — never carries `slot`. Proves
			// the lookup can't be satisfied by a non-unlock row.
			await ctx.db.insert("doorLog", {
				...base,
				trigger: "resend",
				at: 3_000,
				operation: "grant",
				outcome: "ok",
			});
		});
		const who = await t
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBe(4_000);
	});

	it("blocks nothing after an ok row without a durationMs", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		await t.run(async (ctx) => {
			await ctx.db.insert("doorLog", {
				trigger: "app",
				email: EMAIL,
				name: "Bo Ard",
				personId,
				lockNames: ["Upstairs"],
				at: 1_000,
				operation: "unlock",
				outcome: "ok",
				slot: "upstairs",
			});
		});
		const who = await t
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBe(1_000);
	});

	it("ignores a granted OK row with no slot", async () => {
		// A non-unlock row can never satisfy the debounce lookup, because only
		// `operation: "unlock"` rows carry `slot` — this is what makes
		// `operation === "unlock"` implied by a match instead of checked.
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		await t.run(async (ctx) => {
			await ctx.db.insert("doorLog", {
				trigger: "resend",
				email: EMAIL,
				name: "Bo Ard",
				personId,
				lockNames: ["Upstairs"],
				at: 1_000,
				operation: "grant",
				outcome: "ok",
			});
		});
		const who = await t
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBeUndefined();
	});

	it("ignores a successful unlock of the OTHER door", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		await t.run(async (ctx) => {
			await ctx.db.insert("doorLog", {
				trigger: "app",
				email: EMAIL,
				name: "Bo Ard",
				personId,
				lockNames: ["Downstairs"],
				at: 5_000,
				operation: "unlock",
				outcome: "ok",
				slot: "downstairs",
			});
		});
		const who = await t
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBeUndefined();
	});

	it("counts the newest ok row of this door only when its action matches", async () => {
		// Unlock at 1_000, then lock at 2_000, both upstairs and ok. The newest
		// row is the lock: it is a repeat for a lock request, and NOT for an
		// unlock — even though an older ok unlock row exists.
		const t = convexTest(schema, modules);
		const personId = await seed(t, {});
		const base = {
			trigger: "app" as const,
			email: EMAIL,
			name: "Bo Ard",
			personId,
			lockNames: ["Upstairs"],
			outcome: "ok" as const,
			slot: "upstairs" as const,
			durationMs: 3_000,
		};
		await t.run(async (ctx) => {
			await ctx.db.insert("doorLog", {
				...base,
				at: 1_000,
				operation: "unlock",
			});
			await ctx.db.insert("doorLog", {
				...base,
				at: 2_000,
				operation: "lock",
			});
		});
		const as = t.withIdentity({ email: EMAIL });
		const forLock = await as.query(
			internal.doorInternal.doorActionContext,
			{
				lock: "upstairs",
				action: "lock",
			}
		);
		expect(forLock?.lastSameActionUntil).toBe(5_000);
		const forUnlock = await as.query(
			internal.doorInternal.doorActionContext,
			{ lock: "upstairs", action: "unlock" }
		);
		expect(forUnlock?.lastSameActionUntil).toBeUndefined();
	});
});

describe("doorInternal.canSeeDoorPosition", () => {
	const EMAIL = "board@example.com";

	async function seed(
		t: ReturnType<typeof convexTest>,
		fields: Record<string, unknown>
	) {
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: EMAIL,
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				...fields,
			})
		);
	}

	it("is true for someone the door opens for", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(true);
	});

	it("is false when unauthenticated", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {});
		expect(
			await t.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(false);
	});

	it("is false for someone the board has shut out", async () => {
		const t = convexTest(schema, modules);
		await seed(t, {
			tier: "member",
			door: { override: "force_off", reason: "under review" },
		});
		expect(
			await t
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(false);
	});
});

describe("doorInternal door position cache", () => {
	it("misses when stale, hits when fresh", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "locked",
			checkedAt: 1_000,
		});
		expect(
			await t.query(internal.doorInternal.readDoorPositionCache, {
				slot: "upstairs",
				freshSince: 1_000,
			})
		).toBe("locked");
		expect(
			await t.query(internal.doorInternal.readDoorPositionCache, {
				slot: "upstairs",
				freshSince: 1_001,
			})
		).toBeNull();
		expect(
			await t.query(internal.doorInternal.readDoorPositionCache, {
				slot: "downstairs",
				freshSince: 0,
			})
		).toBeNull();
	});

	it("keeps one row per slot on upsert", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "locked",
			checkedAt: 1_000,
		});
		await t.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "unlocked",
			checkedAt: 2_000,
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("doorPositionCache").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			slot: "upstairs",
			position: "unlocked",
			checkedAt: 2_000,
		});
	});
});

describe("doorInternal email lookup", () => {
	it("finds the caller whatever the case of the identity's email", async () => {
		const t = convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asCaller = t.withIdentity({ email: "Board@Example.COM" });
		expect(
			await asCaller.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(true);
		expect(
			await asCaller.query(internal.doorInternal.doorActionContext, {
				lock: "downstairs",
				action: "unlock",
			})
		).toMatchObject({ email: "board@example.com" });
	});
});
