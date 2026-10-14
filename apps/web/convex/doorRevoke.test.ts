import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import { setDoorProviderForTests } from "./lib/doorProvider.ts";
import {
	FAKE_SLOT_LOCK_IDS,
	FakeDoorProvider,
} from "./lib/fakeDoorProvider.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

describe("doorTargetFor", () => {
	it("reports the per-person target the RECONCILE_DOOR effect acts on", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
				accessUntil: Date.now() - DAY,
			})
		);

		expect(
			await backend.query(internal.doorRevoke.doorTargetFor, {
				personId: id,
			})
		).toEqual({
			status: "target",
			email: "ada@example.com",
			name: "Ada Lovelace",
			keepsBreakGlass: false,
		});
	});

	it("reports not_found for a deleted person", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) => {
			const inserted = await context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gon",
				lastName: "E",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.delete(inserted);
			return inserted;
		});

		expect(
			await backend.query(internal.doorRevoke.doorTargetFor, {
				personId: id,
			})
		).toEqual({
			status: "not_found",
		});
	});
});

async function seedEntitledAndDenied(backend: TestConvex<typeof schema>) {
	return backend.run(async (context) => {
		const entitled = await context.db.insert("people", {
			email: "ada@jfloor.test",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		});
		const denied = await context.db.insert("people", {
			email: "gone@jfloor.test",
			firstName: "Gone",
			lastName: "G",
			tier: "guest",
			stage: "expired",
			stageSince: Date.now(),
			accessUntil: Date.now() - DAY,
		});
		return { entitled, denied };
	});
}

/**
 * Every deployment holding the provider credentials reaches the same lock
 * account. Before this gate, the dev deployment's nightly sweep created real
 * account users for the dev seed people, and prod's GC then listed them as
 * strangers to revoke. With no test provider injected, a revoke runs only on
 * a deployment opted in to door writes; the test process never opts in, so
 * here it must read and write nothing. Which setting opts in is the
 * adapter's business, pinned by its own test.
 */
describe("the door write gate", () => {
	afterEach(() => {
		setDoorProviderForTests(undefined);
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("revokeUnlessBreakGlass does not revoke a denied person when door writes are disabled", async () => {
		const backend = convexTest(schema, modules);
		const { denied } = await seedEntitledAndDenied(backend);
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: denied,
				trigger: "lifecycle",
			}
		);

		expect(result).toEqual({ outcome: "disabled" });
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(
			await backend.run(async (context) =>
				context.db.query("doorLog").collect()
			)
		).toEqual([]);
	});

	it("revokeUnlessBreakGlass does nothing for an entitled person when door writes are disabled", async () => {
		const backend = convexTest(schema, modules);
		const { entitled } = await seedEntitledAndDenied(backend);
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: entitled,
				trigger: "lifecycle",
			}
		);

		expect(result).toEqual({ outcome: "disabled" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

function expiredGuest(
	backend: TestConvex<typeof schema>,
	door?: { override: "none" | "force_off"; doorUserId?: string }
) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "expired@example.com",
			firstName: "Ex",
			lastName: "Pired",
			tier: "guest",
			stage: "expired",
			stageSince: Date.now(),
			accessUntil: Date.now() - DAY,
			...(door ? { door } : {}),
		})
	);
}

async function logRows(backend: TestConvex<typeof schema>) {
	return backend.run(async (context) =>
		context.db.query("doorLog").collect()
	);
}

/**
 * Revoke-only: nobody is granted a personal key any more (the app opens the
 * door), so a board/admin person whose access is granted is a no-op (their key
 * is the break-glass fallback) and anyone else loses their keys on the two J
 * floor locks — never someone else's key that merely shares their name.
 */
describe("revokeUnlessBreakGlass", () => {
	const DN = FAKE_SLOT_LOCK_IDS.downstairs;
	const UP = FAKE_SLOT_LOCK_IDS.upstairs;

	afterEach(() => {
		setDoorProviderForTests(undefined);
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	/** An account where `email` (provider id `providerUserId`) holds both J floor
	 *  locks, beside someone else's key. */
	function account(email: string, providerUserId = "u1"): FakeDoorProvider {
		return new FakeDoorProvider({
			identities: [
				{
					providerUserId,
					email,
					authIds: [
						{ lockId: DN, authId: "a-dn" },
						{ lockId: UP, authId: "a-up" },
					],
				},
				{
					providerUserId: "u2",
					email: "someone.else@example.com",
					authIds: [{ lockId: DN, authId: "b-dn" }],
				},
			],
			locks: [
				{
					lockId: DN,
					name: "J Floor City - Downstairs",
				},
				{ lockId: UP, name: "J Floor City - Upstairs" },
			],
		});
	}

	it("revokes a denied person's keys on both doors, and nobody else's", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend);
		const fake = account("expired@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: id,
				trigger: "lifecycle",
				detail: "WINDOW_EXPIRED",
			}
		);

		expect(result).toEqual({
			outcome: "revoked",
			email: "expired@example.com",
			revoked: 2,
		});
		expect(fake.calls.revokes).toEqual([["a-dn", "a-up"]]);
		const touched = fake.calls.revokes.flat();
		expect(touched).not.toContain("b-dn");
	});

	it("writes one revoke row naming the locks it cleared", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend);
		setDoorProviderForTests(account("expired@example.com"));

		await backend.action(internal.doorRevoke.revokeUnlessBreakGlass, {
			personId: id,
			trigger: "override",
			detail: "under review",
		});

		expect(await logRows(backend)).toEqual([
			expect.objectContaining({
				operation: "revoke",
				trigger: "override",
				detail: "under review",
				email: "expired@example.com",
				personId: id,
				lockNames: [
					"J Floor City - Downstairs",
					"J Floor City - Upstairs",
				],
				outcome: "ok",
			}),
		]);
	});

	it("matches the person by their stored provider id when the provider-side email is stale", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend, {
			override: "none",
			doorUserId: "u9",
		});
		const fake = account("old.address@example.com", "u9");
		setDoorProviderForTests(fake);

		await backend.action(internal.doorRevoke.revokeUnlessBreakGlass, {
			personId: id,
			trigger: "lifecycle",
		});

		expect(fake.calls.revokes).toEqual([["a-dn", "a-up"]]);
	});

	it("spares an identity carrying spareEmail even when the stored provider id matches it", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend, {
			override: "none",
			doorUserId: "u9",
		});
		const fake = new FakeDoorProvider({
			identities: [
				{
					providerUserId: "u9",
					email: "Kept.Person@example.com",
					authIds: [{ lockId: DN, authId: "kept-dn" }],
				},
				{
					providerUserId: "u1",
					email: "expired@example.com",
					authIds: [{ lockId: UP, authId: "own-up" }],
				},
			],
			locks: [
				{ lockId: DN, name: "J Floor City - Downstairs" },
				{ lockId: UP, name: "J Floor City - Upstairs" },
			],
		});
		setDoorProviderForTests(fake);

		await backend.action(internal.doorRevoke.revokeUnlessBreakGlass, {
			personId: id,
			trigger: "lifecycle",
			spareEmail: "kept.person@example.com",
		});

		expect(fake.calls.revokes).toEqual([["own-up"]]);
	});

	it("never matches by name alone — a same-named stranger keeps their key", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend);
		const fake = account("a.stranger@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: id,
				trigger: "lifecycle",
			}
		);

		expect(result).toEqual({
			outcome: "revoked",
			email: "expired@example.com",
			revoked: 0,
		});
		expect(fake.calls.revokes).toEqual([]);
		expect(await logRows(backend)).toEqual([]);
	});

	it("does nothing for a board member whose access is granted: no provider call, no row", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const fake = account("board@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: id,
				trigger: "lifecycle",
			}
		);

		expect(result).toEqual({
			outcome: "kept",
			email: "board@example.com",
		});
		// Their key is the break-glass fallback: every call array stays empty,
		// not just revokes.
		expect(fake.calls).toEqual({
			revokes: [],
			actuations: [],
			lockStatusReads: 0,
			positions: [],
		});
		expect(await logRows(backend)).toEqual([]);
	});

	it("revokes a member's key even though their access is granted — only board/admin keep one", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "member@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const fake = account("member@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: id,
				trigger: "lifecycle",
				detail: "SET_ROLE",
			}
		);

		expect(result).toEqual({
			outcome: "revoked",
			email: "member@example.com",
			revoked: 2,
		});
		expect(fake.calls.revokes).toEqual([["a-dn", "a-up"]]);
		expect(await logRows(backend)).toHaveLength(1);
	});

	it("revokes a board member's key when the board has shut them out (force_off)", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				door: { override: "force_off" },
			})
		);
		const fake = account("board@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(
			internal.doorRevoke.revokeUnlessBreakGlass,
			{
				personId: id,
				trigger: "override",
			}
		);

		expect(result).toEqual({
			outcome: "revoked",
			email: "board@example.com",
			revoked: 2,
		});
		expect(fake.calls.revokes).toEqual([["a-dn", "a-up"]]);
	});

	it("rejects when the revoke fails, so the scheduled run shows as failed", async () => {
		const backend = convexTest(schema, modules);
		const id = await expiredGuest(backend);
		const fake = account("expired@example.com");
		vi.spyOn(fake, "revokeAuthIds").mockRejectedValue(
			new Error("the lock provider is down")
		);
		setDoorProviderForTests(fake);

		await expect(
			backend.action(internal.doorRevoke.revokeUnlessBreakGlass, {
				personId: id,
				trigger: "lifecycle",
			})
		).rejects.toThrow(/the lock provider is down/);
		expect(await logRows(backend)).toEqual([]);
	});
});
