/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("doorInternal.doorActionContext", () => {
	const EMAIL = "board@example.com";

	async function seed(
		backend: ReturnType<typeof convexTest>,
		fields: Record<string, unknown>
	) {
		return backend.run(async (context) =>
			context.db.insert("people", {
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
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
		expect(
			await backend
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
		const backend = convexTest(schema, modules);
		await seed(backend, { tier: "admin" });
		expect(
			await backend
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
			const backend = convexTest(schema, modules);
			const personId = await seed(backend, { tier });
			expect(
				await backend
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
		const backend = convexTest(schema, modules);
		await seed(backend, {
			tier: "guest",
			accessFrom: Date.now() - 86_400_000,
			accessUntil: Date.now() + 86_400_000,
		});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).not.toBeNull();
	});

	it("refuses a guest whose access window has closed", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {
			tier: "guest",
			stage: "expired",
			accessUntil: Date.now() - 1000,
		});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a member the door is forced shut for", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {
			tier: "member",
			door: { override: "force_off", reason: "test" },
		});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a prospect (not a tier the door is open for)", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, { tier: "prospect", stage: "verified" });
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses a board member the door is forced shut for", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {
			door: { override: "force_off", reason: "test" },
		});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.doorActionContext, {
					lock: "downstairs",
					action: "unlock",
				})
		).toBeNull();
	});

	it("refuses an unauthenticated caller", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {});
		expect(
			await backend.query(internal.doorInternal.doorActionContext, {
				lock: "downstairs",
				action: "unlock",
			})
		).toBeNull();
	});

	it("reports the latest SUCCESSFUL unlock of THIS door only", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
		const base = {
			trigger: "app" as const,
			email: EMAIL,
			name: "Bo Ard",
			personId,
			lockNames: ["Upstairs"],
		};
		await backend.run(async (context) => {
			// The successful unlock this test proves is picked up.
			await context.db.insert("doorLog", {
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
			await context.db.insert("doorLog", {
				...base,
				at: 2_000,
				operation: "unlock",
				outcome: "failed",
				slot: "upstairs",
				detail: "offline",
			});
			// A same-person, ok-outcome GRANT row — never carries `slot`. Proves
			// the lookup can't be satisfied by a non-unlock row.
			await context.db.insert("doorLog", {
				...base,
				trigger: "resend",
				at: 3_000,
				operation: "grant",
				outcome: "ok",
			});
		});
		const who = await backend
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBe(4_000);
	});

	it("blocks nothing after an ok row without a durationMs", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
		await backend.run(async (context) => {
			await context.db.insert("doorLog", {
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
		const who = await backend
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
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
		await backend.run(async (context) => {
			await context.db.insert("doorLog", {
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
		const who = await backend
			.withIdentity({ email: EMAIL })
			.query(internal.doorInternal.doorActionContext, {
				lock: "upstairs",
				action: "unlock",
			});
		expect(who?.lastSameActionUntil).toBeUndefined();
	});

	it("ignores a successful unlock of the OTHER door", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
		await backend.run(async (context) => {
			await context.db.insert("doorLog", {
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
		const who = await backend
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
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, {});
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
		await backend.run(async (context) => {
			await context.db.insert("doorLog", {
				...base,
				at: 1_000,
				operation: "unlock",
			});
			await context.db.insert("doorLog", {
				...base,
				at: 2_000,
				operation: "lock",
			});
		});
		const as = backend.withIdentity({ email: EMAIL });
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
		backend: ReturnType<typeof convexTest>,
		fields: Record<string, unknown>
	) {
		await backend.run(async (context) =>
			context.db.insert("people", {
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
		const backend = convexTest(schema, modules);
		await seed(backend, {});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(true);
	});

	it("is false when unauthenticated", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {});
		expect(
			await backend.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(false);
	});

	it("is false for someone the board has shut out", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, {
			tier: "member",
			door: { override: "force_off", reason: "under review" },
		});
		expect(
			await backend
				.withIdentity({ email: EMAIL })
				.query(internal.doorInternal.canSeeDoorPosition, {})
		).toBe(false);
	});
});

describe("doorInternal door position cache", () => {
	it("misses when stale, hits when fresh", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "locked",
			checkedAt: 1_000,
		});
		expect(
			await backend.query(internal.doorInternal.readDoorPositionCache, {
				slot: "upstairs",
				freshSince: 1_000,
			})
		).toBe("locked");
		expect(
			await backend.query(internal.doorInternal.readDoorPositionCache, {
				slot: "upstairs",
				freshSince: 1_001,
			})
		).toBeNull();
		expect(
			await backend.query(internal.doorInternal.readDoorPositionCache, {
				slot: "downstairs",
				freshSince: 0,
			})
		).toBeNull();
	});

	it("keeps one row per slot on upsert", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "locked",
			checkedAt: 1_000,
		});
		await backend.mutation(internal.doorInternal.writeDoorPositionCache, {
			slot: "upstairs",
			position: "unlocked",
			checkedAt: 2_000,
		});
		const rows = await backend.run(async (context) =>
			context.db.query("doorPositionCache").collect()
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
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const asCaller = backend.withIdentity({ email: "Board@Example.COM" });
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
