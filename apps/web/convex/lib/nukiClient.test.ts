import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockNamesFromModel } from "./doorProvider.ts";
import {
	configuredLockStatus,
	doorProviderFromEnv,
	doorProviderConfigured,
	doorWritesEnabled,
	lockSlotIds,
	listAccountUsers,
	nukiProvider,
	parseLockIds,
	readSnapshot,
	revokeAuthIds,
	nukiActionFor,
	type NukiDeps,
} from "./nukiClient.ts";

const DOWNSTAIRS_ID = "1111111111";
const UPSTAIRS_ID = "2222222222";
const UNMANAGED_ID = "3333333333";

const LOCK_SLOT_IDS = { downstairs: DOWNSTAIRS_ID, upstairs: UPSTAIRS_ID };

beforeEach(() => {
	vi.stubEnv("NUKI_LOCK_DOWNSTAIRS", DOWNSTAIRS_ID);
	vi.stubEnv("NUKI_LOCK_UPSTAIRS", UPSTAIRS_ID);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

type Call = { method: string; path: string; body: unknown };

/** The two locks every fixture below grants on, both answering healthy. Nuki
 *  reports lock ids as NUMBERS; the env var carries strings, and the client has
 *  to bridge that — so the fixture keeps the real shape. */
const HEALTHY_LOCKS = [
	{ smartlockId: 1, name: "Downstairs", serverState: 0 },
	{ smartlockId: 2, name: "Upstairs", serverState: 0 },
];
type RouteResult = { status?: number; json?: unknown };

function fakeFetch(
	routes: Record<string, (body: unknown) => RouteResult>,
	calls: Call[]
): typeof fetch {
	function impl(url: string, init?: RequestInit): Promise<Response> {
		const method = init?.method ?? "GET";
		const path = url.replace("https://api.nuki.io", "");
		const body: unknown =
			typeof init?.body === "string"
				? (JSON.parse(init.body) as unknown)
				: undefined;
		calls.push({ method, path, body });
		const table = routes as Partial<
			Record<string, (body: unknown) => RouteResult>
		>;
		const handler =
			table[`${method} ${path}`] ??
			// Every lock reachable, unless a test says otherwise. The provider
			// reads lock health before granting, and the alternative — spelling
			// the route out in every fixture — would make the health check look
			// like an incidental detail of each test rather than a step in the
			// flow they all share.
			(method === "GET" && path === "/smartlock"
				? (): RouteResult => ({ json: HEALTHY_LOCKS })
				: undefined);
		if (!handler) throw new Error(`unexpected ${method} ${path}`);
		const r = handler(body);
		const status = r.status ?? 200;
		const res = {
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve(r.json ?? null),
			text: () => Promise.resolve(r.json ? JSON.stringify(r.json) : ""),
		} as unknown as Response;
		return Promise.resolve(res);
	}
	return impl as unknown as typeof fetch;
}

function deps(fetchImpl: typeof fetch): NukiDeps {
	return { fetch: fetchImpl, token: "tok" };
}

describe("parseLockIds", () => {
	it("splits, trims and drops empties", () => {
		expect(parseLockIds("123, 456")).toEqual(["123", "456"]);
		expect(parseLockIds("")).toEqual([]);
		expect(parseLockIds(undefined)).toEqual([]);
	});
});

describe("readSnapshot", () => {
	it("throws on a non-2xx response", async () => {
		const calls: Call[] = [];
		const fetch = fakeFetch(
			{
				"GET /account/user": () => ({
					status: 401,
					json: { error: "no" },
				}),
				"GET /smartlock/auth": () => ({ json: [] }),
			},
			calls
		);
		// A bad status surfaces here rather than being swallowed into an empty
		// account that would look like "nobody has any locks".
		await expect(readSnapshot(deps(fetch))).rejects.toThrow(/401/);
	});
});

/**
 * One retry policy on `req()` covers every Nuki HTTP verb. Delays are
 * deterministic (750, 1500, 3000, 6000) so a fake `sleep` can assert them.
 */
function retryDeps(fetchImpl: typeof fetch, sleeps: number[]): NukiDeps {
	return {
		fetch: fetchImpl,
		token: "tok",
		sleep: (ms: number) => {
			sleeps.push(ms);
			return Promise.resolve();
		},
	};
}

function sequencedFetch(
	events: (number | Error)[],
	calls: Call[]
): typeof fetch {
	let i = 0;
	function impl(url: string, init?: RequestInit): Promise<Response> {
		const method = init?.method ?? "GET";
		const path = url.replace("https://api.nuki.io", "");
		calls.push({ method, path, body: undefined });
		const event = events[Math.min(i, events.length - 1)];
		i += 1;
		if (event instanceof Error) return Promise.reject(event);
		const status = event;
		return Promise.resolve({
			ok: status >= 200 && status < 300,
			status,
			json: () => Promise.resolve([]),
			text: () => Promise.resolve(""),
		} as unknown as Response);
	}
	return impl as unknown as typeof fetch;
}

describe("req retries", () => {
	it("backs off exponentially on 429 then succeeds", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([429, 200], calls);
		await listAccountUsers(retryDeps(fetch, sleeps));
		expect(calls).toHaveLength(2);
		expect(sleeps).toEqual([750]);
	});

	it("sleeps 750, 1500, 3000, 6000 before giving up a 429", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([429], calls);
		await expect(
			listAccountUsers(retryDeps(fetch, sleeps))
		).rejects.toThrow(/429/);
		expect(calls).toHaveLength(5);
		expect(sleeps).toEqual([750, 1500, 3000, 6000]);
	});

	it("retries a 500 then succeeds", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([500, 200], calls);
		await expect(
			listAccountUsers(retryDeps(fetch, sleeps))
		).resolves.toEqual([]);
		expect(calls).toHaveLength(2);
		expect(sleeps).toEqual([750]);
	});

	it("retries a 408", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([408, 200], calls);
		await listAccountUsers(retryDeps(fetch, sleeps));
		expect(calls).toHaveLength(2);
	});

	it("does not retry a 401", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([401], calls);
		await expect(
			listAccountUsers(retryDeps(fetch, sleeps))
		).rejects.toThrow(/401/);
		expect(calls).toHaveLength(1);
		expect(sleeps).toEqual([]);
	});

	it("retries a thrown fetch then succeeds", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch(
			[new Error("ECONNRESET"), new Error("ECONNRESET"), 200],
			calls
		);
		await listAccountUsers(retryDeps(fetch, sleeps));
		expect(calls).toHaveLength(3);
		expect(sleeps).toEqual([750, 1500]);
	});

	it("retries a 429 on DELETE", async () => {
		const calls: Call[] = [];
		const sleeps: number[] = [];
		const fetch = sequencedFetch([429, 204], calls);
		await revokeAuthIds(retryDeps(fetch, sleeps), ["a1"]);
		expect(calls).toHaveLength(2);
		expect(calls[0]?.method).toBe("DELETE");
		expect(sleeps).toEqual([750]);
	});
});

describe("configuredLockStatus", () => {
	it("names each configured lock and flags offline or missing ones", () => {
		expect(
			configuredLockStatus(
				[
					{ smartlockId: 1, name: "Downstairs", serverState: 0 },
					{ smartlockId: 2, name: "Upstairs", serverState: 4 },
				],
				["1", "2", "3"]
			)
		).toEqual([
			{
				lockId: "1",
				name: "Downstairs",
				online: true,
				serverState: 0,
			},
			{
				lockId: "2",
				name: "Upstairs",
				online: false,
				serverState: 4,
			},
			{
				lockId: "3",
				name: "unknown lock 3",
				online: false,
				serverState: -1,
			},
		]);
	});
});

describe("nukiProvider.readModel", () => {
	const UP = UPSTAIRS_ID;
	const DN = DOWNSTAIRS_ID;

	function fakeProviderFetch(map: Record<string, unknown>): typeof fetch {
		function impl(url: string): Promise<Response> {
			const path = new URL(url).pathname;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(map[path]),
				text: () => Promise.resolve(""),
			} as unknown as Response);
		}
		return impl as unknown as typeof fetch;
	}

	it("leaves out authorizations on a configured lock this app does not manage", async () => {
		const fetch = fakeProviderFetch({
			"/account/user": [
				{ accountUserId: 1, email: "a@example.com", name: "Ann A" },
			],
			"/smartlock/auth": [
				{
					id: "dn",
					accountUserId: 1,
					smartlockId: Number(DN),
					type: 0,
				},
				{
					id: "other",
					accountUserId: 1,
					smartlockId: Number(UNMANAGED_ID),
					type: 0,
				},
				{
					id: "o-other",
					smartlockId: Number(UNMANAGED_ID),
					name: "Bo B",
					type: 0,
				},
			],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 0 },
				{ smartlockId: DN, name: "DN", serverState: 0 },
				{ smartlockId: UNMANAGED_ID, name: "Other", serverState: 0 },
			],
		});
		const model = await nukiProvider({ fetch, token: "t" }, [
			UP,
			DN,
			UNMANAGED_ID,
		]).readModel();
		expect(model.identities[0]?.authIds).toEqual([
			{ lockId: DN, authId: "dn" },
		]);
		// Lock names still cover every configured id.
		expect(model.locks.map((l) => l.lockId)).toEqual([
			UP,
			DN,
			UNMANAGED_ID,
		]);
	});

	it("treats account users whose emails differ only in case as one identity holding both records' auths", async () => {
		const fetch = fakeProviderFetch({
			"/account/user": [
				{ accountUserId: 1, email: "Ada@Example.COM", name: "Ada L" },
				{ accountUserId: 2, email: "ada@example.com", name: "Ada L" },
			],
			"/smartlock/auth": [
				{
					id: "a1",
					accountUserId: 1,
					smartlockId: Number(UP),
					type: 0,
				},
				{
					id: "a2",
					accountUserId: 2,
					smartlockId: Number(DN),
					type: 0,
				},
			],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 0 },
				{ smartlockId: DN, name: "DN", serverState: 0 },
			],
		});
		const model = await nukiProvider({ fetch, token: "t" }, [
			UP,
			DN,
		]).readModel();
		expect(model.identities).toHaveLength(1);
		expect(model.identities[0]?.email).toBe("Ada@Example.COM");
		expect(
			model.identities[0]?.authIds?.map((a) => a.authId)?.sort()
		).toEqual(["a1", "a2"]);
	});

	it("groups identities and leaves auths with no account user out of the model", async () => {
		const fetch = fakeProviderFetch({
			"/account/user": [
				{ accountUserId: 1, email: "a@example.com", name: "Ann A" },
			],
			"/smartlock/auth": [
				{
					id: "y",
					accountUserId: 1,
					smartlockId: DN,
					lockCount: 3,
					lastActiveDate: "2026-05-01T00:00:00.000Z",
				},
				// Account-user auth on a NON-configured lock — must not appear in
				// authIds, or a revoke would delete keys on a lock this deployment
				// does not manage.
				{ id: "z", accountUserId: 1, smartlockId: "999", lockCount: 7 },
				{ id: "o", smartlockId: UP, name: "Bo B", lockCount: 4 }, // no account user
			],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 0 },
				{ smartlockId: DN, name: "DN", serverState: 0 },
			],
		});
		const provider = nukiProvider({ fetch, token: "t" }, [UP, DN]);
		const model = await provider.readModel();
		expect(model.identities).toEqual([
			{
				providerUserId: "1",
				email: "a@example.com",
				// Only the configured-lock account-user auth "y"; the untied "o"
				// (no accountUserId) and the non-configured "z" are excluded.
				authIds: [{ lockId: DN, authId: "y" }],
			},
		]);
		const upLock = model.locks.find((c) => c.lockId === UP);
		expect(upLock).toEqual({ lockId: UP, name: "UP" });
	});

	it("never puts the lock's own 'Nuki Web' authorization in authIds", async () => {
		// Every lock with Nuki Web activated carries one auth named "Nuki Web":
		// the Nuki Web service's own authorization, through which this API
		// operates the lock. Deleting it disconnects the lock from the API the
		// whole door integration runs on, so no identity may list it, with or
		// without an account user.
		const fetch = fakeProviderFetch({
			"/account/user": [
				{ accountUserId: 1, email: "a@example.com", name: "Ann A" },
			],
			"/smartlock/auth": [
				{ id: "nw-up", smartlockId: UP, name: "Nuki Web" },
				{ id: "nw-dn", smartlockId: DN, name: "Nuki Web" },
				{
					id: "nw-user",
					accountUserId: 1,
					smartlockId: DN,
					name: "Nuki Web",
				},
				{ id: "o", smartlockId: UP, name: "Bo B" },
				{ id: "own", accountUserId: 1, smartlockId: UP, name: "Ann" },
			],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 0 },
				{ smartlockId: DN, name: "DN", serverState: 0 },
			],
		});
		const provider = nukiProvider({ fetch, token: "t" }, [UP, DN]);
		const model = await provider.readModel();

		expect(model.identities.flatMap((i) => i.authIds ?? [])).toEqual([
			{ lockId: UP, authId: "own" },
		]);
	});

	it("lists one lock per configured id, named by its id when Nuki did not return it", async () => {
		const fetch = fakeProviderFetch({
			"/account/user": [],
			"/smartlock/auth": [],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 3 },
				{ smartlockId: 999, name: "Not ours", serverState: 0 },
			],
		});
		const provider = nukiProvider({ fetch, token: "t" }, [UP, DN]);
		const model = await provider.readModel();

		expect(model.locks).toEqual([
			{ lockId: UP, name: "UP" },
			{ lockId: DN, name: DN },
		]);
		expect(lockNamesFromModel(model, [DN, "L9"])).toEqual([
			DN,
			"unknown lock L9",
		]);
	});

	it("lists only account-user auths in authIds, never a device or untied auth", async () => {
		const fetch = fakeProviderFetch({
			"/account/user": [
				{ accountUserId: 1, email: "a@example.com", name: "Ann A" },
			],
			"/smartlock/auth": [
				{ id: "app", accountUserId: 1, smartlockId: DN, type: 0 },
				{ id: "code", accountUserId: 1, smartlockId: UP, type: 13 },
				{ id: "bridge", smartlockId: DN, name: "Bridge", type: 1 },
				{ id: "keypad", smartlockId: UP, name: "Keypad", type: 3 },
				{ id: "untyped", smartlockId: UP, name: "Old" },
			],
			"/smartlock": [
				{ smartlockId: UP, name: "UP", serverState: 0 },
				{ smartlockId: DN, name: "DN", serverState: 0 },
			],
		});
		const provider = nukiProvider({ fetch, token: "t" }, [UP, DN]);
		const model = await provider.readModel();

		expect(model.identities[0]?.authIds).toEqual([
			{ lockId: DN, authId: "app" },
			{ lockId: UP, authId: "code" },
		]);
	});
});

describe("nukiActionFor (unlock)", () => {
	it("buzzes an Opener and unlocks a Smart Lock", () => {
		expect(nukiActionFor(2, "unlock")).toBe(3);
		for (const t of [0, 3, 4, 5])
			expect(nukiActionFor(t, "unlock")).toBe(1);
	});
	it("refuses device types it cannot open", () => {
		expect(() => nukiActionFor(1, "unlock")).toThrow(/Unsupported/);
		expect(() => nukiActionFor(undefined, "unlock")).toThrow(/Unsupported/);
	});
});

describe("nukiProvider.actuate (unlock)", () => {
	const DN = LOCK_SLOT_IDS.downstairs;
	const UP = LOCK_SLOT_IDS.upstairs;

	function provider(
		routes: Record<string, (body: unknown) => RouteResult>,
		calls: Call[]
	) {
		return nukiProvider({ fetch: fakeFetch(routes, calls), token: "t" }, [
			DN,
			UP,
		]);
	}

	it("buzzes the downstairs Opener with action 3", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
						openerAdvancedConfig: {
							electricStrikeDelay: 500,
							electricStrikeDuration: 3000,
						},
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 204 }),
			},
			calls
		);
		expect(await p.actuate("downstairs", "unlock")).toEqual({
			status: "ok",
			lockName: "J Floor City - Downstairs",
			durationMs: 3500,
			positionBefore: "unknown",
		});
		const post = calls.filter((c) => c.method === "POST");
		expect(post).toEqual([
			{
				method: "POST",
				path: `/smartlock/${DN}/action`,
				body: { action: 3, option: 0 },
			},
		]);
	});

	it("falls back to 3000 ms when the Opener config has no strike duration", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 204 }),
			},
			calls
		);
		expect(await p.actuate("downstairs", "unlock")).toEqual({
			status: "ok",
			lockName: "J Floor City - Downstairs",
			durationMs: 3000,
			positionBefore: "unknown",
		});
	});

	it("unlocks the upstairs Smart Lock with action 1", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${UP}`]: () => ({
					json: {
						smartlockId: Number(UP),
						name: "J Floor City - Upstairs",
						type: 5,
						serverState: 0,
					},
				}),
				[`POST /smartlock/${UP}/action`]: () => ({ status: 204 }),
			},
			calls
		);
		expect(await p.actuate("upstairs", "unlock")).toEqual({
			status: "ok",
			lockName: "J Floor City - Upstairs",
			durationMs: 5000,
			positionBefore: "unknown",
		});
		expect(calls.find((c) => c.method === "POST")?.body).toEqual({
			action: 1,
			option: 0,
		});
	});

	it("reports an offline lock without actuating it", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${UP}`]: () => ({
					json: {
						smartlockId: Number(UP),
						name: "J Floor City - Upstairs",
						type: 5,
						serverState: 4,
					},
				}),
			},
			calls
		);
		expect(await p.actuate("upstairs", "unlock")).toEqual({
			status: "offline",
			lockName: "J Floor City - Upstairs",
		});
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});

	it("never retries a failed actuation", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 503 }),
			},
			calls
		);
		await expect(p.actuate("downstairs", "unlock")).rejects.toThrow(/503/);
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
	});

	it("reports a lock still carrying out its last command (423) as busy", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 423 }),
			},
			calls
		);
		expect(await p.actuate("downstairs", "unlock")).toEqual({
			status: "busy",
			lockName: "J Floor City - Downstairs",
		});
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
	});

	it("never retries the health read either", async () => {
		const calls: Call[] = [];
		const p = provider(
			{ [`GET /smartlock/${DN}`]: () => ({ status: 429 }) },
			calls
		);
		await expect(p.actuate("downstairs", "unlock")).rejects.toThrow(/429/);
		expect(calls).toHaveLength(1);
	});

	it("refuses a slot whose lock is not configured", async () => {
		const calls: Call[] = [];
		const p = nukiProvider({ fetch: fakeFetch({}, calls), token: "t" }, [
			UP,
		]);
		await expect(p.actuate("downstairs", "unlock")).rejects.toThrow(
			/not configured/
		);
		expect(calls).toHaveLength(0);
	});

	it("reports where the door was, from the read that preceded the command", async () => {
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
						state: { state: 1 },
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 204 }),
				[`GET /smartlock/${UP}`]: () => ({
					json: {
						smartlockId: Number(UP),
						name: "J Floor City - Upstairs",
						type: 5,
						serverState: 0,
						state: { state: 3 },
					},
				}),
				[`POST /smartlock/${UP}/action`]: () => ({ status: 204 }),
			},
			[]
		);
		expect(await p.actuate("downstairs", "unlock")).toMatchObject({
			status: "ok",
			positionBefore: "locked",
		});
		expect(await p.actuate("upstairs", "unlock")).toMatchObject({
			status: "ok",
			positionBefore: "unlocked",
		});
	});
});

describe("nukiProvider.position", () => {
	const UP = LOCK_SLOT_IDS.upstairs;
	const DN = LOCK_SLOT_IDS.downstairs;

	function provider(
		routes: Record<string, (body: unknown) => RouteResult>,
		calls: Call[]
	) {
		return nukiProvider({ fetch: fakeFetch(routes, calls), token: "t" }, [
			DN,
			UP,
		]);
	}

	function upstairs(state?: number, serverState = 0) {
		return (): RouteResult => ({
			json: {
				smartlockId: Number(UP),
				name: "J Floor City - Upstairs",
				type: 5,
				serverState,
				...(state === undefined ? {} : { state: { state } }),
			},
		});
	}

	it.each([
		[1, "locked"],
		[3, "unlocked"],
		[5, "unlocked"],
		[6, "unlocked"],
		[2, "unlocking"],
		[4, "locking"],
		[7, "unlocking"],
		[0, "unknown"],
	] as const)("maps Nuki state %i to %s", async (state, expected) => {
		const calls: Call[] = [];
		const p = provider(
			{ [`GET /smartlock/${UP}`]: upstairs(state) },
			calls
		);
		expect(await p.position("upstairs")).toBe(expected);
		expect(calls).toEqual([
			{ method: "GET", path: `/smartlock/${UP}`, body: undefined },
		]);
	});

	it("is unknown when the lock reports no state", async () => {
		const p = provider({ [`GET /smartlock/${UP}`]: upstairs() }, []);
		expect(await p.position("upstairs")).toBe("unknown");
	});

	it("is offline when the provider cannot reach the lock", async () => {
		const p = provider({ [`GET /smartlock/${UP}`]: upstairs(1, 4) }, []);
		expect(await p.position("upstairs")).toBe("offline");
	});

	it("reads a lock that reports no serverState as reachable", async () => {
		const route = upstairs(1);
		const p = provider(
			{
				[`GET /smartlock/${UP}`]: () => {
					const result = route();
					delete (result.json as { serverState?: number })
						.serverState;
					return result;
				},
			},
			[]
		);
		expect(await p.position("upstairs")).toBe("locked");
	});

	it("logs the state when a reachable lock maps to unknown", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const p = provider({ [`GET /smartlock/${UP}`]: upstairs(255) }, []);
		expect(await p.position("upstairs")).toBe("unknown");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("state 255"));
		warn.mockRestore();
	});

	function downstairs(state?: number) {
		return (): RouteResult => ({
			json: {
				smartlockId: Number(DN),
				name: "J Floor City - Downstairs",
				type: 2,
				serverState: 0,
				...(state === undefined ? {} : { state: { state } }),
			},
		});
	}

	it.each([
		[1, "locked"],
		[7, "unlocking"],
		[5, "unlocked"],
		[3, "unknown"],
	] as const)("maps Opener state %i to %s", async (state, expected) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const p = provider({ [`GET /smartlock/${DN}`]: downstairs(state) }, []);
		expect(await p.position("downstairs")).toBe(expected);
		warn.mockRestore();
	});

	it("logs an Opener state it does not model (3, ring-to-open active)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const p = provider({ [`GET /smartlock/${DN}`]: downstairs(3) }, []);
		expect(await p.position("downstairs")).toBe("unknown");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("state 3"));
		warn.mockRestore();
	});

	it("throws for a slot whose lock is not configured", async () => {
		const calls: Call[] = [];
		const p = nukiProvider({ fetch: fakeFetch({}, calls), token: "t" }, [
			DN,
		]);
		await expect(p.position("upstairs")).rejects.toThrow(/not configured/);
		expect(calls).toEqual([]);
	});

	it("reads once and does not retry a 503", async () => {
		const calls: Call[] = [];
		const p = provider(
			{ [`GET /smartlock/${UP}`]: () => ({ status: 503 }) },
			calls
		);
		await expect(p.position("upstairs")).rejects.toThrow();
		expect(calls).toHaveLength(1);
	});
});

describe("nukiActionFor (lock)", () => {
	it("locks a Smart Lock with action 2", () => {
		for (const t of [0, 3, 4, 5]) expect(nukiActionFor(t, "lock")).toBe(2);
	});
	it("refuses to lock an Opener, which has no lock action", () => {
		expect(() => nukiActionFor(2, "lock")).toThrow(/Opener/);
	});
	it("refuses device types it cannot lock", () => {
		expect(() => nukiActionFor(1, "lock")).toThrow(/Unsupported/);
		expect(() => nukiActionFor(undefined, "lock")).toThrow(/Unsupported/);
	});
});

describe("nukiProvider.actuate (lock)", () => {
	const DN = LOCK_SLOT_IDS.downstairs;
	const UP = LOCK_SLOT_IDS.upstairs;

	function provider(
		routes: Record<string, (body: unknown) => RouteResult>,
		calls: Call[]
	) {
		return nukiProvider({ fetch: fakeFetch(routes, calls), token: "t" }, [
			DN,
			UP,
		]);
	}

	function upstairs(): RouteResult {
		return {
			json: {
				smartlockId: Number(UP),
				name: "J Floor City - Upstairs",
				type: 5,
				serverState: 0,
			},
		};
	}

	it("locks the upstairs Smart Lock with action 2", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${UP}`]: upstairs,
				[`POST /smartlock/${UP}/action`]: () => ({ status: 204 }),
			},
			calls
		);
		expect(await p.actuate("upstairs", "lock")).toEqual({
			status: "ok",
			lockName: "J Floor City - Upstairs",
			durationMs: 5000,
			positionBefore: "unknown",
		});
		expect(calls.filter((c) => c.method === "POST")).toEqual([
			{
				method: "POST",
				path: `/smartlock/${UP}/action`,
				body: { action: 2, option: 0 },
			},
		]);
	});

	it("refuses to lock the downstairs Opener without actuating it", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 0,
					},
				}),
				[`POST /smartlock/${DN}/action`]: () => ({ status: 204 }),
			},
			calls
		);
		await expect(p.actuate("downstairs", "lock")).rejects.toThrow(/Opener/);
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});

	it("refuses to lock an OFFLINE Opener rather than reporting it offline", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${DN}`]: () => ({
					json: {
						smartlockId: Number(DN),
						name: "J Floor City - Downstairs",
						type: 2,
						serverState: 4,
					},
				}),
			},
			calls
		);
		await expect(p.actuate("downstairs", "lock")).rejects.toThrow(/Opener/);
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});

	it("never retries a failed lock", async () => {
		const calls: Call[] = [];
		const p = provider(
			{
				[`GET /smartlock/${UP}`]: upstairs,
				[`POST /smartlock/${UP}/action`]: () => ({ status: 503 }),
			},
			calls
		);
		await expect(p.actuate("upstairs", "lock")).rejects.toThrow(/503/);
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
	});
});

describe("doorProviderFromEnv and the write gate", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("talks to the Nuki Web API at api.nuki.io", async () => {
		vi.stubEnv("NUKI_API_TOKEN", "test-token");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", LOCK_SLOT_IDS.upstairs);
		const urls: string[] = [];
		vi.stubGlobal("fetch", (input: string) => {
			urls.push(input);
			return Promise.resolve(
				new Response("[]", {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			);
		});
		await doorProviderFromEnv({ requireWrites: false }).readLockStatus();
		expect(urls).toEqual(["https://api.nuki.io/smartlock"]);
	});

	it.each(["", "0", "true", "yes"])(
		"treats NUKI_WRITE_ENABLED=%j as writes disabled",
		(flag) => {
			vi.stubEnv("NUKI_WRITE_ENABLED", flag);
			expect(doorWritesEnabled()).toBe(false);
		}
	);

	it("treats only NUKI_WRITE_ENABLED=1 as writes enabled", () => {
		vi.stubEnv("NUKI_WRITE_ENABLED", "1");
		expect(doorWritesEnabled()).toBe(true);
	});

	it("refuses a write-requiring provider without the opt-in, before calling Nuki", () => {
		vi.stubEnv("NUKI_API_TOKEN", "test-token");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", "1,2");
		vi.stubEnv("NUKI_WRITE_ENABLED", "");
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		expect(() => doorProviderFromEnv({ requireWrites: true })).toThrow(
			'Door writes are disabled on this deployment (NUKI_WRITE_ENABLED is not "1"), so nothing was sent to the lock.'
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("builds a read-only provider without the opt-in", () => {
		vi.stubEnv("NUKI_API_TOKEN", "test-token");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", "1,2");
		vi.stubEnv("NUKI_WRITE_ENABLED", "");
		expect(() =>
			doorProviderFromEnv({ requireWrites: false })
		).not.toThrow();
	});

	it("reads a door position through a read-only provider without the opt-in", async () => {
		const UP = LOCK_SLOT_IDS.upstairs;
		vi.stubEnv("NUKI_API_TOKEN", "test-token");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", `${LOCK_SLOT_IDS.downstairs},${UP}`);
		vi.stubEnv("NUKI_WRITE_ENABLED", "");
		const calls: string[] = [];
		vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${input}`);
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						smartlockId: Number(UP),
						type: 5,
						serverState: 0,
						state: { state: 1 },
					}),
				text: () => Promise.resolve(""),
			});
		});
		expect(
			await doorProviderFromEnv({ requireWrites: false }).position(
				"upstairs"
			)
		).toBe("locked");
		expect(calls).toEqual([`GET https://api.nuki.io/smartlock/${UP}`]);
	});

	it("names the missing Nuki credential", () => {
		vi.stubEnv("NUKI_API_TOKEN", "");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", "1,2");
		expect(() => doorProviderFromEnv({ requireWrites: false })).toThrow(
			"NUKI_API_TOKEN is not set."
		);
	});

	it("builds the provider from NUKI_SMARTLOCK_IDS and still leaves out the lock that is not ours", async () => {
		const DN = LOCK_SLOT_IDS.downstairs;
		const UP = LOCK_SLOT_IDS.upstairs;
		vi.stubEnv("NUKI_API_TOKEN", "test-token");
		vi.stubEnv("NUKI_SMARTLOCK_IDS", `${DN},${UP},${UNMANAGED_ID}`);
		const map: Record<string, unknown> = {
			"/account/user": [
				{ accountUserId: 1, email: "a@example.com", name: "Ann A" },
			],
			"/smartlock/auth": [
				{
					id: "dn",
					accountUserId: 1,
					smartlockId: Number(DN),
					type: 0,
				},
				{
					id: "other",
					accountUserId: 1,
					smartlockId: Number(UNMANAGED_ID),
					type: 0,
				},
				{
					id: "o-other",
					smartlockId: Number(UNMANAGED_ID),
					name: "Bo B",
					type: 0,
				},
			],
			"/smartlock": [
				{ smartlockId: Number(DN), name: "DN", serverState: 0 },
				{ smartlockId: Number(UP), name: "UP", serverState: 0 },
				{
					smartlockId: Number(UNMANAGED_ID),
					name: "Other",
					serverState: 0,
				},
			],
		};
		vi.stubGlobal("fetch", (url: string) =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(map[new URL(url).pathname]),
				text: () => Promise.resolve(""),
			} as unknown as Response)
		);
		const model = await doorProviderFromEnv({
			requireWrites: false,
		}).readModel();
		expect(model.identities[0]?.authIds).toEqual([
			{ lockId: DN, authId: "dn" },
		]);
		expect(model.locks.map((l) => l.lockId).sort()).toEqual(
			[DN, UP, UNMANAGED_ID].sort()
		);
	});
});

describe("nukiProvider.readLockStatus", () => {
	it("reports one row per configured lock from a single lock read", async () => {
		const calls: Call[] = [];
		const p = nukiProvider({ fetch: fakeFetch({}, calls), token: "t" }, [
			"1",
			"2",
			"3",
		]);
		expect(await p.readLockStatus()).toEqual([
			{ lockId: "1", name: "Downstairs", online: true, serverState: 0 },
			{ lockId: "2", name: "Upstairs", online: true, serverState: 0 },
			{
				lockId: "3",
				name: "unknown lock 3",
				online: false,
				serverState: -1,
			},
		]);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			"GET /smartlock",
		]);
	});
});

describe("lock ids from the environment", () => {
	it("maps each slot to the id in its env var", () => {
		expect(lockSlotIds()).toEqual({
			downstairs: DOWNSTAIRS_ID,
			upstairs: UPSTAIRS_ID,
		});
	});

	it.each(["NUKI_LOCK_DOWNSTAIRS", "NUKI_LOCK_UPSTAIRS"])(
		"is not configured when %s is missing",
		(name) => {
			vi.stubEnv(name, "");
			expect(() => lockSlotIds()).toThrow(`${name} is not set.`);
			expect(() => nukiProvider({ fetch, token: "t" }, ["1"])).toThrow(
				`${name} is not set.`
			);
			vi.stubEnv("NUKI_API_TOKEN", "test-token");
			vi.stubEnv("NUKI_SMARTLOCK_IDS", `${DOWNSTAIRS_ID},${UPSTAIRS_ID}`);
			expect(doorProviderConfigured()).toBe(false);
			expect(() => doorProviderFromEnv({ requireWrites: false })).toThrow(
				`${name} is not set.`
			);
		}
	);

	it("sends nothing for a slot whose lock is not configured", async () => {
		const calls: Call[] = [];
		const p = nukiProvider({ fetch: fakeFetch({}, calls), token: "t" }, [
			DOWNSTAIRS_ID,
			UNMANAGED_ID,
		]);
		await expect(p.actuate("upstairs", "unlock")).rejects.toThrow(
			`Lock ${UPSTAIRS_ID} is not configured.`
		);
		expect(calls).toEqual([]);
	});
});
