import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { issueToken } from "./lib/confirmToken.ts";
import { BATCH_SIZE } from "./purge.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

describe("purgeUnverified", () => {
	it("deletes an unverified prospect whose token expired, with its audit rows, and logs the count", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "stale@example.com",
				firstName: "Stale",
				lastName: "Prospect",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			});
			await issueToken(ctx, {
				token: "stale",
				purpose: "application",
				personId,
				ttlMs: -DAY,
			});
			await ctx.db.insert("personEvents", {
				personId,
				at: Date.now(),
				kind: "transition",
				// "SUBMIT" is not in ALL_EVENTS and never will be — a sign-up
				// CREATES the row already in prospect.unverified, so the machine has
				// no edge for it. It exists only as a synthesised history label the
				// one-time migration to the machine wrote for rows that predated it,
				// and `personEvents.event` is a plain `v.string()`, so this fixture
				// is exactly what that migration produced. Do not "fix" it to a real
				// event.
				event: "SUBMIT",
				to: "prospect.unverified",
			});
			return personId;
		});

		expect(
			(await t.mutation(internal.purge.purgeUnverified, {})).count
		).toBe(1);
		expect(await t.run(async (ctx) => ctx.db.get(id))).toBeNull();
		expect(
			await t.run(async (ctx) => ctx.db.query("personEvents").collect())
		).toHaveLength(0);
		const log = await t.run(async (ctx) =>
			ctx.db.query("purgeLog").collect()
		);
		expect(log).toHaveLength(1);
		expect(log[0].count).toBe(1);
	});

	it("keeps unverified prospects inside the token window", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "fresh@example.com",
				firstName: "Fresh",
				lastName: "Prospect",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			});
			await issueToken(ctx, {
				token: "fresh",
				purpose: "application",
				personId,
				ttlMs: DAY,
			});
		});

		expect(
			(await t.mutation(internal.purge.purgeUnverified, {})).count
		).toBe(0);
		expect(
			await t.run(async (ctx) => ctx.db.query("people").collect())
		).toHaveLength(1);
	});

	it("never touches verified prospects or any other tier", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "verified@example.com",
				firstName: "V",
				lastName: "P",
				tier: "prospect",
				stage: "verified",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "member@example.com",
				firstName: "M",
				lastName: "M",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});

		expect(
			(await t.mutation(internal.purge.purgeUnverified, {})).count
		).toBe(0);
		expect(
			await t.run(async (ctx) => ctx.db.query("people").collect())
		).toHaveLength(2);
	});

	it("writes a purgeLog row even on a run that deletes nothing", async () => {
		// The log is how a broken verification email surfaces: a run of 0 next to
		// a run of 40 is only readable if every run is recorded.
		const t = convexTest(schema, modules);
		await t.mutation(internal.purge.purgeUnverified, {});
		expect(
			await t.run(async (ctx) => ctx.db.query("purgeLog").collect())
		).toHaveLength(1);
	});

	it("caps a single run at BATCH_SIZE and leaves the rest for the next night", async () => {
		// The sign-up form is public and unauthenticated, so a bot spike can put
		// far more abandoned rows in front of the purge than fit in one Convex
		// transaction. A run over the cap must delete exactly BATCH_SIZE and
		// leave the remainder for the next run to pick up — not read the whole
		// backlog and abort with nothing purged.
		const EXTRA = 3;
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			for (let i = 0; i < BATCH_SIZE + EXTRA; i++) {
				await ctx.db.insert("people", {
					email: `stale-${String(i)}@example.com`,
					firstName: "Stale",
					lastName: String(i),
					tier: "prospect",
					stage: "unverified",
					stageSince: Date.now(),
				});
			}
		});

		const first = await t.mutation(internal.purge.purgeUnverified, {});
		expect(first.count).toBe(BATCH_SIZE);
		expect(
			await t.run(async (ctx) => ctx.db.query("people").collect())
		).toHaveLength(EXTRA);

		const second = await t.mutation(internal.purge.purgeUnverified, {});
		expect(second.count).toBe(EXTRA);
		expect(
			await t.run(async (ctx) => ctx.db.query("people").collect())
		).toHaveLength(0);
	});

	it("purges an unverified prospect with no live token and keeps a former member whose staged token expired", async () => {
		const t = convexTest(schema, modules);
		const [staleId, formerId] = await t.run(async (ctx) => {
			const s = await ctx.db.insert("people", {
				email: "s@example.com",
				firstName: "S",
				lastName: "",
				tier: "prospect",
				stage: "unverified",
				stageSince: 0,
			});
			const f = await ctx.db.insert("people", {
				email: "f@example.com",
				firstName: "F",
				lastName: "",
				tier: "former",
				stage: "active",
				stageSince: 0,
				verifiedAt: 1,
			});
			await issueToken(ctx, {
				token: "old",
				purpose: "application",
				personId: f,
				ttlMs: -1,
				payload: {
					firstName: "X",
					lastName: "",
					phone: "",
					vertical: ["ai"],
					venture: {},
					submittedAt: 0,
				},
			});
			await ctx.db.insert("personEvents", {
				personId: f,
				at: 0,
				kind: "transition",
				event: "SUBMIT",
				to: "prospect.unverified",
			});
			return [s, f];
		});
		const res = await t.mutation(internal.purge.purgeUnverified, {});
		expect(res.count).toBe(1);
		expect(res.tokens).toBe(1);
		expect(await t.run((ctx) => ctx.db.get(staleId))).toBeNull();
		expect(await t.run((ctx) => ctx.db.get(formerId))).not.toBeNull();
		expect(
			await t.run((ctx) => ctx.db.query("personEvents").collect())
		).toHaveLength(1);
		expect(
			await t.run((ctx) => ctx.db.query("confirmTokens").collect())
		).toHaveLength(0);
	});

	it("purges an abandoned unconfirmed visitor, but keeps a confirmed one", async () => {
		// The public visitor form is the other self-serve, bot-reachable
		// surface (see Global Constraints), so it gets the same sweep as
		// prospect — but only ever the abandoned ones, never a confirmed
		// visitor. Both fixtures live in one test so the confirmed row's
		// survival is proven against the very run that deletes its sibling,
		// not just against a run with nothing else in the table.
		const t = convexTest(schema, modules);
		const staleId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "stale-visitor@example.com",
				firstName: "Stale",
				lastName: "Visitor",
				tier: "visitor",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);
		const confirmedId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "confirmed-visitor@example.com",
				firstName: "Confirmed",
				lastName: "Visitor",
				tier: "visitor",
				stage: "verified",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
			})
		);

		expect(
			(await t.mutation(internal.purge.purgeUnverified, {})).count
		).toBe(1);
		expect(await t.run(async (ctx) => ctx.db.get(staleId))).toBeNull();
		expect(
			await t.run(async (ctx) => ctx.db.get(confirmedId))
		).not.toBeNull();
	});
});

describe("purgeEmail", () => {
	it("deletes the person, their signatures, events and confirm tokens, and leaves others", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("people", {
				email: "stay@example.com",
				firstName: "Stay",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "gone@example.com",
				variant: "member",
				signedName: "Gone Person",
				agreementVersion: "v1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			await ctx.db.insert("personEvents", {
				personId,
				at: Date.now(),
				kind: "transition",
				event: "IMPORT",
				to: "member.active",
			});
			await issueToken(ctx, {
				token: "staged",
				purpose: "application",
				personId,
				ttlMs: DAY,
			});
		});

		const res = await t.mutation(internal.purge.purgeEmail, {
			email: "gone@example.com",
		});
		expect(res.deleted).toBe(4);
		const left = await t.run(async (ctx) =>
			ctx.db.query("people").collect()
		);
		expect(left.map((p) => p.email)).toEqual(["stay@example.com"]);
		const tokens = await t.run((ctx) =>
			ctx.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(0);
	});

	it("keeps an email change the purged person requested but drops their actorId", async () => {
		const t = convexTest(schema, modules);
		const otherId = await t.run(async (ctx) => {
			const boardId = await ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Board",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			const id = await ctx.db.insert("people", {
				email: "stay@example.com",
				firstName: "Stay",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await issueToken(ctx, {
				token: "change",
				purpose: "emailChange",
				personId: id,
				ttlMs: DAY,
				newEmail: "new@example.com",
				actorId: boardId,
			});
			return id;
		});

		await t.mutation(internal.purge.purgeEmail, {
			email: "gone@example.com",
		});
		const tokens = await t.run((ctx) =>
			ctx.db.query("confirmTokens").collect()
		);
		expect(tokens).toHaveLength(1);
		expect(tokens[0].personId).toBe(otherId);
		expect(tokens[0].newEmail).toBe("new@example.com");
		expect(tokens[0].actorId).toBeUndefined();
	});

	it("deletes the person's notification history and leaves other people's", async () => {
		const t = convexTest(schema, modules);
		const createdAt = Date.now();
		const stayId = await t.run(async (ctx) => {
			const goneId = await ctx.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: createdAt,
			});
			const stay = await ctx.db.insert("people", {
				email: "stay@example.com",
				firstName: "Stay",
				lastName: "Person",
				tier: "member",
				stage: "active",
				stageSince: createdAt,
			});
			for (const personId of [goneId, stay]) {
				await ctx.db.insert("notifications", {
					personId,
					kind: "taskAssigned",
					title: "New task assigned",
					body: "Wire it",
					url: "/tasks",
					createdAt,
				});
			}
			return stay;
		});

		const res = await t.mutation(internal.purge.purgeEmail, {
			email: "gone@example.com",
		});

		expect(res.deleted).toBe(2);
		const left = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(left.map((r) => r.personId)).toEqual([stayId]);
	});
});
