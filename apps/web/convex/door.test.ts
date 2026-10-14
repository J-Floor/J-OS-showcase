import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { access } from "./lib/derive.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

async function setup() {
	const backend = convexTest(schema, modules);
	const boardId = await backend.run(async (context) =>
		context.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	const memberId = await backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return {
		backend,
		asBoard: backend.withIdentity({ email: "board@example.com" }),
		boardId,
		memberId,
	};
}

/**
 * Every job an effect (or, here, `setOverride`) queued, straight off the
 * `_scheduled_functions` system table — see `convex/lifecycle.test.ts`'s
 * `scheduledJobs` for why this is the only reliable way to prove the RIGHT
 * function was scheduled with the RIGHT args, as opposed to merely proving a
 * `personEvents` row exists. `convex-test` records a row here at
 * `runAfter`/`runAt` time and only executes it if the test calls
 * `finishAllScheduledFunctions`, which this file deliberately never does.
 */
async function scheduledJobs(backend: TestConvex<typeof schema>) {
	return backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
}

describe("door.setOverride", () => {
	it("suspends an active member with a reason and an actor, and reconciles the lock", async () => {
		const { backend, asBoard, boardId, memberId } = await setup();

		await asBoard.mutation(api.door.setOverride, {
			personId: memberId,
			override: "force_off",
			reason: "no night access until we talk",
		});

		const person = await backend.run(async (context) =>
			context.db.get(memberId)
		);
		expect(person?.door).toMatchObject({
			override: "force_off",
			reason: "no night access until we talk",
			byId: boardId,
		});
		expect(person?.door?.at).toBeTypeOf("number");

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) =>
					range.eq("personId", memberId)
				)
				.collect()
		);
		expect(events.at(-1)).toMatchObject({
			kind: "door",
			before: "none",
			after: "force_off",
			meta: "no night access until we talk",
			actorId: boardId,
		});
		expect(events.at(-1)?.at).toBeTypeOf("number");

		// The override is only real if the reconciler was actually asked to make
		// the lock agree — a test that stops at `personEvents`/`door` would still
		// pass if `setOverride` never scheduled anything, e.g. if it were
		// swapped for some other scheduled job entirely.
		const jobs = await scheduledJobs(backend);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: memberId,
							trigger: "override",
							detail: "no night access until we talk",
						},
					],
				}),
			])
		);
	});

	it("keeps the stored provider account id, so a later revoke can still find the key", async () => {
		const { backend, asBoard, memberId } = await setup();
		await backend.run(async (context) =>
			context.db.patch(memberId, {
				door: {
					override: "none",
					doorUserId: "12345",
				},
			})
		);

		await asBoard.mutation(api.door.setOverride, {
			personId: memberId,
			override: "force_off",
			reason: "left the space",
		});

		const person = await backend.run(async (context) =>
			context.db.get(memberId)
		);
		expect(person?.door).toMatchObject({
			override: "force_off",
			doorUserId: "12345",
		});
	});

	it("grants an otherwise-unentitled person end to end with force_on", async () => {
		const { backend, asBoard } = await setup();
		const prospectId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "prospect@example.com",
				firstName: "Pro",
				lastName: "Spect",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			})
		);
		const before = await backend.run(async (context) =>
			context.db.get(prospectId)
		);
		expect(access(before!, Date.now())).toBe("denied");

		await asBoard.mutation(api.door.setOverride, {
			personId: prospectId,
			override: "force_on",
			reason: "let them in for the demo night",
		});

		const person = await backend.run(async (context) =>
			context.db.get(prospectId)
		);
		expect(person?.door?.override).toBe("force_on");
		expect(access(person!, Date.now())).toBe("granted");

		const jobs = await scheduledJobs(backend);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: prospectId,
							trigger: "override",
							detail: "let them in for the demo night",
						},
					],
				}),
			])
		);
	});

	it("clearing the override is its own act, returning access to the machine's own answer", async () => {
		const { backend, asBoard, boardId, memberId } = await setup();
		await asBoard.mutation(api.door.setOverride, {
			personId: memberId,
			override: "force_off",
			reason: "under review",
		});
		const suspended = await backend.run(async (context) =>
			context.db.get(memberId)
		);
		expect(access(suspended!, Date.now())).toBe("denied");

		await asBoard.mutation(api.door.setOverride, {
			personId: memberId,
			override: "none",
		});

		const person = await backend.run(async (context) =>
			context.db.get(memberId)
		);
		expect(person?.door?.override).toBe("none");
		// Not "restored to some stored value" — the active member is entitled on
		// their own, so the machine's own answer is "granted" once nothing
		// overrides it.
		expect(access(person!, Date.now())).toBe("granted");

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) =>
					range.eq("personId", memberId)
				)
				.collect()
		);
		expect(events.at(-1)).toMatchObject({
			kind: "door",
			before: "force_off",
			after: "none",
			actorId: boardId,
		});
	});

	it("survives a promotion — GRANT_CORE never touches door", async () => {
		const { backend, asBoard, memberId } = await setup();
		await asBoard.mutation(api.door.setOverride, {
			personId: memberId,
			override: "force_off",
			reason: "under review",
		});
		await asBoard.mutation(api.lifecycle.transition, {
			personId: memberId,
			event: { type: "GRANT_CORE" },
		});

		const person = await backend.run(async (context) =>
			context.db.get(memberId)
		);
		expect(person?.tier).toBe("core");
		// GRANT_CORE writes tier/stage/stageSince and nothing else, so a `door`
		// that survived is meaningful only because setOverride wrote it first —
		// which the previous assertion in this test established.
		expect(person?.door?.override).toBe("force_off");
		expect(person?.door?.reason).toBe("under review");
	});

	it("survives a window extension — EXTEND_WINDOW never touches door", async () => {
		const { backend, asBoard } = await setup();
		const until = Date.now() + 30 * DAY;
		const guestId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "guest@example.com",
				firstName: "Gil",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessFrom: Date.now() - DAY,
				accessUntil: until,
			})
		);
		await asBoard.mutation(api.door.setOverride, {
			personId: guestId,
			override: "force_off",
			reason: "no night access until we talk",
		});

		const laterUntil = until + 10 * DAY;
		await asBoard.mutation(api.lifecycle.transition, {
			personId: guestId,
			event: { type: "EXTEND_WINDOW", until: laterUntil },
		});

		const person = await backend.run(async (context) =>
			context.db.get(guestId)
		);
		expect(person?.accessUntil).toBe(laterUntil);
		expect(person?.door?.override).toBe("force_off");
		expect(person?.door?.reason).toBe("no night access until we talk");
	});

	it("rejects a non-board caller", async () => {
		const { backend, memberId } = await setup();
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.door.setOverride, {
					personId: memberId,
					override: "force_on",
				})
		).rejects.toThrow(/Forbidden/);
	});
});

/**
 * The Flags column, the drawer's Status line and the drawer's override control
 * all claim to describe the same thing, and were reported as disagreeing. This
 * pins the server half: one read after the change carries the new flag AND the
 * new fact, so any disagreement on screen is the client rendering a stale copy.
 */
it("a door override changes the roster's flags and facts on the next read", async () => {
	const backend = convexTest(schema, modules);
	await backend.run(async (context) =>
		context.db.insert("people", {
			email: "boss@example.com",
			firstName: "Boss",
			lastName: "",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	const board = backend.withIdentity({ email: "boss@example.com" });
	const id = await backend.run(async (context) =>
		context.db.insert("people", {
			email: "m@example.com",
			firstName: "M",
			lastName: "",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
			door: { override: "none" },
		})
	);

	function doorOf(
		rows: {
			_id: string;
			status: { flags: unknown[]; facts: { id: string }[] };
		}[]
	) {
		const row = rows.find((candidate) => candidate._id === id)!;
		return {
			flags: row.status.flags.filter((flag) =>
				(flag as { id: string }).id.startsWith("door")
			),
			door: row.status.facts.find((fact) => fact.id === "door"),
		};
	}

	expect(doorOf(await board.query(api.people.listMembers, {}))).toEqual({
		flags: [],
		door: { id: "door", state: "open", actorName: undefined },
	});

	await board.mutation(api.door.setOverride, {
		personId: id,
		override: "force_off",
	});
	expect(doorOf(await board.query(api.people.listMembers, {}))).toEqual({
		flags: [{ id: "door_suspended", actorName: "Boss" }],
		door: { id: "door", state: "suspended", actorName: "Boss" },
	});

	await board.mutation(api.door.setOverride, {
		personId: id,
		override: "force_on",
	});
	expect(doorOf(await board.query(api.people.listMembers, {}))).toEqual({
		flags: [{ id: "door_forced_open", actorName: "Boss" }],
		door: { id: "door", state: "forced_open", actorName: "Boss" },
	});
});
