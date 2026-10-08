import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { components, internal } from "./_generated/api";
import { issueToken } from "./lib/confirmToken.ts";
import { BATCH_SIZE } from "./purge.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

/** A test deployment with the auth and rate-limit components erasure reaches. */
function setup() {
	const t = convexTest(schema, modules);
	betterAuthTest.register(t);
	rateLimiterTest.register(t);
	return t;
}

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
		const t = setup();
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
		const t = setup();
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
		const t = setup();
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

const GONE = {
	email: "zeb.quixley@example.com",
	firstName: "Zebulon",
	lastName: "Quixley",
};

/** A person named in every way the schema allows, beside a person who stays. */
async function seedEverywhere(t: ReturnType<typeof setup>) {
	const at = Date.now();
	const name = `${GONE.firstName} ${GONE.lastName}`;
	const seeded = await t.run(async (ctx) => {
		const goneId = await ctx.db.insert("people", {
			...GONE,
			tier: "board",
			stage: "active",
			stageSince: at,
		});
		const stayId = await ctx.db.insert("people", {
			email: "stay@example.com",
			firstName: "Stay",
			lastName: "Person",
			tier: "guest",
			stage: "active",
			stageSince: at,
			hostedById: goneId,
			door: { override: "force_on", byId: goneId, at },
			onboarding: {
				steps: {},
				boardSteps: { whatsapp: { completedAt: at, byId: goneId } },
			},
			board: { noteLog: [{ authorId: goneId, text: "fine", at }] },
		});
		// An imported guest whose host only resolved to a display name.
		await ctx.db.insert("people", {
			email: "legacy@example.com",
			firstName: "Legacy",
			lastName: "Guest",
			tier: "guest",
			stage: "active",
			stageSince: at,
			hostedBy: name,
		});
		const fileId = await ctx.storage.store(new Blob(["%PDF agreement"]));
		const signatureId = await ctx.db.insert("signatures", {
			personId: goneId,
			email: GONE.email,
			variant: "member",
			signedName: name,
			agreementVersion: "v1",
			agreementHash: "h",
			signedAt: at,
			fileId,
		});
		const projectId = await ctx.db.insert("projects", {
			name: "Roof",
			leaderId: goneId,
			createdBy: goneId,
		});
		const taskId = await ctx.db.insert("tasks", {
			title: "Fix it",
			status: "backlog",
			assigneeIds: [goneId, stayId],
			projectId,
			createdBy: goneId,
		});
		const eventId = await ctx.db.insert("events", {
			name: "Demo night",
			startsAt: at,
			endsAt: at + DAY,
			startsAtLocal: "2026-10-08T18:00:00+02:00[Europe/Zurich]",
			endsAtLocal: "2026-10-09T18:00:00+02:00[Europe/Zurich]",
			createdBy: goneId,
			createdAt: at,
		});
		await ctx.db.insert("eventAttendance", {
			personId: goneId,
			eventId,
			confirmedAt: at,
		});
		await ctx.db.insert("personEvents", {
			personId: goneId,
			at,
			kind: "field_edit",
			field: "email",
			before: "old@example.com",
			after: GONE.email,
		});
		await ctx.db.insert("personEvents", {
			personId: stayId,
			at,
			actorId: goneId,
			kind: "field_edit",
			field: "hostedById",
			after: goneId,
			meta: { reviewers: [goneId] },
		});
		const doorRow = {
			operation: "unlock" as const,
			trigger: "app" as const,
			lockNames: ["Downstairs"],
			outcome: "ok" as const,
		};
		await ctx.db.insert("doorLog", {
			...doorRow,
			at,
			personId: goneId,
			actorId: goneId,
			email: GONE.email,
			name,
		});
		// Written before `personId` was stored: only the address finds it.
		await ctx.db.insert("doorLog", {
			...doorRow,
			at,
			email: GONE.email,
			name,
		});
		await ctx.db.insert("doorLog", {
			...doorRow,
			operation: "revoke",
			trigger: "override",
			at,
			personId: stayId,
			actorId: goneId,
			email: "stay@example.com",
			name: "Stay Person",
		});
		await issueToken(ctx, {
			token: "gone-own",
			purpose: "application",
			personId: goneId,
			ttlMs: DAY,
		});
		await issueToken(ctx, {
			token: "stay-change",
			purpose: "emailChange",
			personId: stayId,
			ttlMs: DAY,
			newEmail: "stay2@example.com",
			actorId: goneId,
		});
		await ctx.db.insert("pushSubscriptions", {
			personId: goneId,
			endpoint: "https://push.example/gone",
			p256dh: "k",
			auth: "a",
			userAgent: "UA",
			createdAt: at,
		});
		for (const personId of [goneId, stayId])
			await ctx.db.insert("notifications", {
				personId,
				kind: "taskAssigned",
				title: "New task",
				body: "Fix it",
				url: "/tasks",
				createdAt: at,
			});
		return { goneId, stayId, fileId, signatureId, taskId, projectId };
	});
	const user = (await t.mutation(components.betterAuth.adapter.create, {
		input: {
			model: "user",
			data: {
				email: GONE.email,
				name,
				emailVerified: true,
				createdAt: at,
				updatedAt: at,
			},
		},
	})) as { _id: string };
	await t.mutation(components.betterAuth.adapter.create, {
		input: {
			model: "session",
			data: {
				token: "session-secret",
				userId: user._id,
				expiresAt: at + DAY,
				createdAt: at,
				updatedAt: at,
				userAgent: "UA",
			},
		},
	});
	await t.mutation(components.betterAuth.adapter.create, {
		input: {
			model: "account",
			data: {
				accountId: user._id,
				providerId: "magic-link",
				userId: user._id,
				createdAt: at,
				updatedAt: at,
			},
		},
	});
	await t.mutation(components.betterAuth.adapter.create, {
		input: {
			model: "verification",
			data: {
				identifier: "hashed-link",
				value: JSON.stringify({ email: GONE.email }),
				expiresAt: at + DAY,
				createdAt: at,
				updatedAt: at,
			},
		},
	});
	return seeded;
}

describe("purgeEmail erases the person everywhere", () => {
	it("leaves no row naming them, no stored file, and no sign-in records", async () => {
		const t = setup();
		const { goneId, stayId, fileId, taskId, projectId } =
			await seedEverywhere(t);

		await t.mutation(internal.purge.purgeEmail, { email: GONE.email });

		const traces = [GONE.email, GONE.firstName, GONE.lastName, goneId];
		const leaks = await t.run(async (ctx) => {
			const found: string[] = [];
			for (const table of Object.keys(schema.tables))
				for (const row of await ctx.db
					.query(table as "people")
					.collect()) {
					const json = JSON.stringify(row);
					for (const trace of traces)
						if (json.includes(trace))
							found.push(`${table}: ${trace}`);
				}
			return found;
		});
		expect(leaks).toEqual([]);
		expect(await t.run((ctx) => ctx.storage.get(fileId))).toBeNull();

		// References on what stays are stripped; the rows themselves are kept.
		const kept = await t.run(async (ctx) => ({
			stay: await ctx.db.get(stayId),
			task: await ctx.db.get(taskId),
			project: await ctx.db.get(projectId),
			doorLog: await ctx.db.query("doorLog").collect(),
		}));
		expect(kept.task?.assigneeIds).toEqual([stayId]);
		expect(kept.project?.name).toBe("Roof");
		expect(kept.stay?.board?.noteLog?.[0].text).toBe("fine");
		expect(kept.doorLog.map((r) => r.email)).toEqual(["stay@example.com"]);

		const after = await t.query(internal.people.exportPerson, {
			email: GONE.email,
		});
		expect(after.people).toEqual([]);
		expect(after.auth).toEqual([]);
		for (const model of ["session", "account", "verification"] as const) {
			const rows = (await t.query(
				components.betterAuth.adapter.findMany,
				{
					model,
					paginationOpts: { cursor: null, numItems: 10 },
				}
			)) as { page: unknown[] };
			expect(rows.page, model).toEqual([]);
		}
	});
});

describe("exportPerson", () => {
	it("returns what is held about the person, without sign-in secrets or other people's rows", async () => {
		const t = setup();
		const { goneId, stayId, signatureId, taskId, projectId } =
			await seedEverywhere(t);

		const out = await t.query(internal.people.exportPerson, {
			email: GONE.email,
		});

		expect(out.people).toHaveLength(1);
		const [{ person, records, references, agreementPdfs }] = out.people;
		expect(person._id).toBe(goneId);
		expect(agreementPdfs.map((pdf) => pdf.signatureId)).toEqual([
			signatureId,
		]);
		expect(agreementPdfs[0].url).toMatch(/^https?:\/\//);
		// Only their own records come back whole: one of each, plus their
		// own door row (the legacy one is listed below, by address).
		expect(Object.keys(records).sort()).toEqual([
			"confirmTokens",
			"doorLog",
			"eventAttendance",
			"notifications",
			"personEvents",
			"pushSubscriptions",
			"signatures",
		]);
		for (const rows of Object.values(records)) expect(rows).toHaveLength(1);
		// Everything else that names them is only pointed at.
		expect(references).toEqual(
			expect.arrayContaining([
				{ table: "people", id: stayId, field: "hostedById" },
				{ table: "people", id: stayId, field: "door.byId" },
				{
					table: "people",
					id: stayId,
					field: "board.noteLog.0.authorId",
				},
				{ table: "tasks", id: taskId, field: "assigneeIds.0" },
				{ table: "tasks", id: taskId, field: "createdBy" },
				{ table: "projects", id: projectId, field: "leaderId" },
			])
		);
		expect(
			new Set(references.map((r) => r.table)).has("confirmTokens")
		).toBe(true);
		// Nothing of the people they are linked to is disclosed.
		const json = JSON.stringify(out);
		for (const other of [
			"stay@example.com",
			"stay2@example.com",
			"Stay Person",
			"legacy@example.com",
			"Roof",
			"Demo night",
		])
			expect(json).not.toContain(other);
		// Their earlier address is included; the legacy door row under the
		// current one comes back, the person who stays's row does not.
		expect(out.addresses.sort()).toEqual(["old@example.com", GONE.email]);
		expect(out.legacyDoorLog).toHaveLength(1);
		expect(out.legacyDoorLog[0].personId).toBeUndefined();
		const current = out.auth.find((a) => a.address === GONE.email);
		expect(current?.user?.email).toBe(GONE.email);
		expect(current?.sessions).toHaveLength(1);
		expect(JSON.stringify(out.auth)).not.toContain("session-secret");
	});
});

describe("purgeEmail never reaches another person's records", () => {
	it("keeps the door history of whoever holds an address the person used, and door rows naming someone else", async () => {
		const t = setup();
		const { stayId } = await seedEverywhere(t);
		const doorRow = {
			operation: "unlock" as const,
			trigger: "app" as const,
			lockNames: ["Downstairs"],
			outcome: "ok" as const,
			at: Date.now(),
		};
		const kept = await t.run(async (ctx) => {
			// Someone else took over the address the person changed away from.
			const takerId = await ctx.db.insert("people", {
				email: "old@example.com",
				firstName: "Taker",
				lastName: "Over",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			return [
				await ctx.db.insert("doorLog", {
					...doorRow,
					personId: takerId,
					email: "old@example.com",
					name: "Taker Over",
				}),
				// No personId, under an address someone else holds now.
				await ctx.db.insert("doorLog", {
					...doorRow,
					email: "old@example.com",
					name: "Taker Over",
				}),
				// Someone else's row stored under the person's current address.
				await ctx.db.insert("doorLog", {
					...doorRow,
					personId: stayId,
					email: GONE.email,
					name: "Stay Person",
				}),
			];
		});

		await t.mutation(internal.purge.purgeEmail, { email: GONE.email });

		const left = await t.run(async (ctx) =>
			Promise.all(kept.map((id) => ctx.db.get(id)))
		);
		expect(left.map((r) => r?._id)).toEqual(kept);
	});

	it("keeps a legacy host name when the guest's host id is someone else's", async () => {
		const t = setup();
		const { stayId } = await seedEverywhere(t);
		const guestId = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "other-guest@example.com",
				firstName: "Other",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				hostedById: stayId,
				hostedBy: `${GONE.firstName} ${GONE.lastName}`,
			})
		);

		await t.mutation(internal.purge.purgeEmail, { email: GONE.email });

		const guest = await t.run((ctx) => ctx.db.get(guestId));
		expect(guest?.hostedBy).toBe(`${GONE.firstName} ${GONE.lastName}`);
	});

	it("leaves a live magic link for an address that merely contains theirs", async () => {
		const t = setup();
		await seedEverywhere(t);
		const at = Date.now();
		const other = `x${GONE.email}`;
		await t.mutation(components.betterAuth.adapter.create, {
			input: {
				model: "verification",
				data: {
					identifier: "other-link",
					value: JSON.stringify({ email: other }),
					expiresAt: at + DAY,
					createdAt: at,
					updatedAt: at,
				},
			},
		});

		await t.mutation(internal.purge.purgeEmail, { email: GONE.email });

		const { page } = (await t.query(
			components.betterAuth.adapter.findMany,
			{
				model: "verification",
				paginationOpts: { cursor: null, numItems: 10 },
			}
		)) as { page: { identifier: string }[] };
		expect(page.map((r) => r.identifier)).toEqual(["other-link"]);
	});
});

describe("purgeEmail erases every address the person used", () => {
	it("removes the sign-in records and legacy door rows under an address they changed away from", async () => {
		const t = setup();
		await seedEverywhere(t);
		const at = Date.now();
		// `seedEverywhere` records an email change from old@example.com.
		const oldUser = (await t.mutation(
			components.betterAuth.adapter.create,
			{
				input: {
					model: "user",
					data: {
						email: "old@example.com",
						name: "Zebulon Quixley",
						emailVerified: true,
						createdAt: at,
						updatedAt: at,
					},
				},
			}
		)) as { _id: string };
		await t.mutation(components.betterAuth.adapter.create, {
			input: {
				model: "session",
				data: {
					token: "old-session",
					userId: oldUser._id,
					expiresAt: at + DAY,
					createdAt: at,
					updatedAt: at,
				},
			},
		});
		const legacyId = await t.run((ctx) =>
			ctx.db.insert("doorLog", {
				operation: "unlock",
				trigger: "app",
				lockNames: ["Downstairs"],
				outcome: "ok",
				at,
				email: "old@example.com",
				name: "Zebulon Quixley",
			})
		);

		const res = await t.mutation(internal.purge.purgeEmail, {
			email: GONE.email,
		});

		expect(res.addresses.sort()).toEqual(["old@example.com", GONE.email]);
		expect(await t.run((ctx) => ctx.db.get(legacyId))).toBeNull();
		for (const model of ["user", "session"] as const) {
			const { page } = (await t.query(
				components.betterAuth.adapter.findMany,
				{ model, paginationOpts: { cursor: null, numItems: 10 } }
			)) as { page: unknown[] };
			expect(page, model).toEqual([]);
		}
	});
});
