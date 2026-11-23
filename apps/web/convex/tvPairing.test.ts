import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { TV_CORS_HEADERS, TV_LIMITS } from "./lib/tv/constants.ts";
import {
	type PairDeps,
	pollPairingResponse,
	preflightResponse,
	startPairingResponse,
} from "./lib/tv/http.ts";
import { hashTvSecret } from "./lib/tv/tokens.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = ReturnType<typeof convexTest>;

async function seedPerson(
	backend: Backend,
	email: string,
	tier: "member" | "board"
) {
	await backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Test",
			lastName: "Person",
			tier,
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return backend.withIdentity({ email });
}

function seedMember(backend: Backend) {
	return seedPerson(backend, "member@example.com", "member");
}
function seedBoard(backend: Backend) {
	return seedPerson(backend, "board@example.com", "board");
}

async function start(backend: Backend, name: string, now = Date.now()) {
	const codeHash = await hashTvSecret(`code-${name}`);
	const pollSecretHash = `poll-${name}`;
	const isStored = await backend.mutation(internal.tvInternal.startPairing, {
		codeHash,
		pollSecretHash,
		now,
	});
	return { code: `code-${name}`, pollSecretHash, isStored };
}

function devices(backend: Backend) {
	return backend.run((context) => context.db.query("tvDevices").collect());
}

afterEach(() => {
	vi.useRealTimers();
});

describe("tv pairing (backend)", () => {
	it("approvePairing refuses a member", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		await start(backend, "1");
		await expect(
			asMember.mutation(api.tv.approvePairing, {
				code: "code-1",
				label: "Lounge TV",
			})
		).rejects.toThrow("Forbidden");
	});

	it("pairingStatus refuses a member", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedMember(backend);
		await start(backend, "1");
		await expect(
			asMember.query(api.tv.pairingStatus, { code: "code-1" })
		).rejects.toThrow("Forbidden");
	});

	it("full flow: start, approve, claim hands over exactly one token", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		const { code, pollSecretHash } = await start(backend, "1");
		expect(await asBoard.query(api.tv.pairingStatus, { code })).toBe(
			"pending"
		);
		await asBoard.mutation(api.tv.approvePairing, {
			code,
			label: "Lounge TV",
		});
		expect(await asBoard.query(api.tv.pairingStatus, { code })).toBe(
			"used"
		);

		const first = await backend.mutation(internal.tvInternal.claimPairing, {
			pollSecretHash,
			tokenHash: "t1",
			now: Date.now(),
		});
		const second = await backend.mutation(
			internal.tvInternal.claimPairing,
			{
				pollSecretHash,
				tokenHash: "t2",
				now: Date.now(),
			}
		);

		expect(first).toBe("claimed");
		expect(second).not.toBe("claimed");
		const rows = await devices(backend);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ tokenHash: "t1", label: "Lounge TV" });
	});

	it("claimPairing before approval is pending and creates no device", async () => {
		const backend = convexTest(schema, modules);
		const { pollSecretHash } = await start(backend, "1");
		const outcome = await backend.mutation(
			internal.tvInternal.claimPairing,
			{
				pollSecretHash,
				tokenHash: "t1",
				now: Date.now(),
			}
		);
		expect(outcome).toBe("pending");
		expect(await devices(backend)).toHaveLength(0);
	});

	it("claimPairing with an unknown poll secret is unknown", async () => {
		const backend = convexTest(schema, modules);
		const outcome = await backend.mutation(
			internal.tvInternal.claimPairing,
			{
				pollSecretHash: "nope",
				tokenHash: "t1",
				now: Date.now(),
			}
		);
		expect(outcome).toBe("unknown");
	});

	it("expired pairing: approve refuses TvPairingExpired; claim returns expired", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		const begun = Date.now();
		const { code, pollSecretHash } = await start(backend, "1", begun);
		const expiresAt = begun + TV_LIMITS.pairingTtlMs;

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(expiresAt + 1);
		await expect(
			asBoard.mutation(api.tv.approvePairing, {
				code,
				label: "Lounge TV",
			})
		).rejects.toThrow("TvPairingExpired");
		expect(await asBoard.query(api.tv.pairingStatus, { code })).toBe(
			"expired"
		);
		const outcome = await backend.mutation(
			internal.tvInternal.claimPairing,
			{
				pollSecretHash,
				tokenHash: "t1",
				now: expiresAt + 1,
			}
		);
		expect(outcome).toBe("expired");
		expect(await devices(backend)).toHaveLength(0);
	});

	it("approve twice refuses TvPairingUsed", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		const { code } = await start(backend, "1");
		await asBoard.mutation(api.tv.approvePairing, { code, label: "A" });
		await expect(
			asBoard.mutation(api.tv.approvePairing, { code, label: "B" })
		).rejects.toThrow("TvPairingUsed");
	});

	it("approve refuses an unknown code and a blank label", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		const { code } = await start(backend, "1");
		await expect(
			asBoard.mutation(api.tv.approvePairing, { code: "zzz", label: "A" })
		).rejects.toThrow("TvPairingInvalid");
		await expect(
			asBoard.mutation(api.tv.approvePairing, { code, label: "   " })
		).rejects.toThrow("TvPairingInvalid");
	});

	it("startPairing returns false at MAX_LIVE_PAIRINGS and succeeds once expired rows are swept", async () => {
		const backend = convexTest(schema, modules);
		const now = Date.now();
		await backend.run(async (context) => {
			for (let index = 0; index < TV_LIMITS.maxLivePairings; index += 1)
				await context.db.insert("tvPairings", {
					codeHash: `c${String(index)}`,
					pollSecretHash: `p${String(index)}`,
					expiresAt: now + 60_000,
				});
		});
		const over = await start(backend, "over", now);
		expect(over.isStored).toBe(false);

		// The same rows, now past their expiry, are swept and no longer count.
		const later = now + 120_000;
		const after = await start(backend, "after", later);
		expect(after.isStored).toBe(true);
		const rows = await backend.run((context) =>
			context.db.query("tvPairings").collect()
		);
		expect(rows).toHaveLength(1);
	});

	it("approve refuses TvTooManyDevices at 10 unrevoked devices (revoked ones do not count)", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await backend.run(async (context) => {
			for (let index = 0; index < TV_LIMITS.maxDevices; index += 1)
				await context.db.insert("tvDevices", {
					tokenHash: `d${String(index)}`,
					label: "TV",
					createdAt: 1,
				});
		});
		const { code } = await start(backend, "1");
		await expect(
			asBoard.mutation(api.tv.approvePairing, { code, label: "Extra" })
		).rejects.toThrow("TvTooManyDevices");

		// Revoking one frees a slot, even with a revoked row ahead in the table.
		await backend.run(async (context) => {
			const first = await context.db.query("tvDevices").first();
			await context.db.patch(first!._id, { revokedAt: 2 });
		});
		await asBoard.mutation(api.tv.approvePairing, { code, label: "Extra" });
		expect(await asBoard.query(api.tv.pairingStatus, { code })).toBe(
			"used"
		);
	});
	it("approved-but-unclaimed pairings count toward the device cap", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await backend.run(async (context) => {
			for (let index = 0; index < TV_LIMITS.maxDevices - 1; index += 1)
				await context.db.insert("tvDevices", {
					tokenHash: `d${String(index)}`,
					label: "TV",
					createdAt: 1,
				});
		});
		const first = await start(backend, "a");
		const second = await start(backend, "b");
		await asBoard.mutation(api.tv.approvePairing, {
			code: first.code,
			label: "A",
		});
		await expect(
			asBoard.mutation(api.tv.approvePairing, {
				code: second.code,
				label: "B",
			})
		).rejects.toThrow("TvTooManyDevices");
	});

	it("claimPairing at the device cap creates no extra device and returns unknown", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedBoard(backend);
		await backend.run(async (context) => {
			for (let index = 0; index < TV_LIMITS.maxDevices - 1; index += 1)
				await context.db.insert("tvDevices", {
					tokenHash: `d${String(index)}`,
					label: "TV",
					createdAt: 1,
				});
		});
		const pairing = await start(backend, "a");
		await asBoard.mutation(api.tv.approvePairing, {
			code: pairing.code,
			label: "A",
		});
		// A device appears between approval and claim.
		await backend.run((context) =>
			context.db.insert("tvDevices", {
				tokenHash: "late",
				label: "TV",
				createdAt: 1,
			})
		);
		const result = await backend.mutation(
			internal.tvInternal.claimPairing,
			{
				pollSecretHash: pairing.pollSecretHash,
				tokenHash: "new-token",
				now: Date.now(),
			}
		);
		expect(result).toBe("unknown");
		expect(await devices(backend)).toHaveLength(TV_LIMITS.maxDevices);
	});
});

const SECRET = "a".repeat(64);

function fakeDeps(overrides: Partial<PairDeps> = {}): PairDeps {
	return {
		limit: () => Promise.resolve(true),
		start: () => Promise.resolve(true),
		claim: () => Promise.resolve("pending"),
		now: () => 1_000,
		...overrides,
	};
}

function post(path: string, body: unknown, isRaw = false): Request {
	return new Request(`https://example.com${path}`, {
		method: "POST",
		headers: { "cf-connecting-ip": "203.0.113.7" },
		body: isRaw ? (body as string) : JSON.stringify(body),
	});
}

function expectCors(response: Response) {
	for (const [name, value] of Object.entries(TV_CORS_HEADERS))
		expect(response.headers.get(name)).toBe(value);
}

describe("startPairingResponse", () => {
	it("returns code, pollSecret and expiry; stores only hashes", async () => {
		const isStartMock = vi.fn(() => Promise.resolve(true));
		const response = await startPairingResponse(
			post("/tv/pair/start", {}),
			fakeDeps({ start: isStartMock })
		);
		expect(response.status).toBe(200);
		expectCors(response);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.code).toMatch(/^[0-9a-f]{64}$/);
		expect(body.pollSecret).toMatch(/^[0-9a-f]{64}$/);
		expect(body.expiresAt).toBe(1_000 + TV_LIMITS.pairingTtlMs);
		const [hashes] = isStartMock.mock.calls[0] as unknown as [
			{ codeHash: string; pollSecretHash: string },
		];
		expect(hashes.codeHash).toBe(await hashTvSecret(body.code as string));
		expect(hashes.pollSecretHash).toBe(
			await hashTvSecret(body.pollSecret as string)
		);
	});

	it("answers 429 when rate-limited, keyed on the caller IP, and stores nothing", async () => {
		const isLimitMock = vi.fn(() => Promise.resolve(false));
		const isStartMock = vi.fn(() => Promise.resolve(true));
		const response = await startPairingResponse(
			post("/tv/pair/start", {}),
			fakeDeps({ limit: isLimitMock, start: isStartMock })
		);
		expect(response.status).toBe(429);
		expectCors(response);
		expect(isLimitMock).toHaveBeenCalledWith("tvPairStart", "203.0.113.7");
		expect(isStartMock).not.toHaveBeenCalled();
	});

	it("answers 503 when the live cap is reached", async () => {
		const response = await startPairingResponse(
			post("/tv/pair/start", {}),
			fakeDeps({ start: () => Promise.resolve(false) })
		);
		expect(response.status).toBe(503);
		expectCors(response);
		expect(await response.json()).toEqual({ error: "busy" });
	});
});

describe("pollPairingResponse", () => {
	it.each([
		["missing body", "", true],
		["not JSON", "{", true],
		["no pollSecret", {}, false],
		["non-string", { pollSecret: 5 }, false],
		["wrong shape", { pollSecret: "short" }, false],
		["uppercase hex", { pollSecret: "A".repeat(64) }, false],
	])(
		"answers 400 for %s without touching the database",
		async (_name, body, isRaw) => {
			const claim = vi.fn(() => Promise.resolve("pending" as const));
			const response = await pollPairingResponse(
				post("/tv/pair/poll", body, isRaw),
				fakeDeps({ claim })
			);
			expect(response.status).toBe(400);
			expectCors(response);
			expect(claim).not.toHaveBeenCalled();
		}
	);

	it("answers 429 when rate-limited", async () => {
		const isLimitMock = vi.fn(() => Promise.resolve(false));
		const response = await pollPairingResponse(
			post("/tv/pair/poll", { pollSecret: SECRET }),
			fakeDeps({ limit: isLimitMock })
		);
		expect(response.status).toBe(429);
		expect(isLimitMock).toHaveBeenCalledWith("tvPairPoll", "203.0.113.7");
	});

	it.each([
		["pending", 200, { status: "pending" }],
		["unknown", 404, { status: "unknown" }],
		["expired", 410, { status: "expired" }],
	] as const)("maps %s to %i", async (outcome, status, body) => {
		const response = await pollPairingResponse(
			post("/tv/pair/poll", { pollSecret: SECRET }),
			fakeDeps({ claim: () => Promise.resolve(outcome) })
		);
		expect(response.status).toBe(status);
		expectCors(response);
		expect(await response.json()).toEqual(body);
	});

	it("returns the raw token once on claim, storing only its hash, and never logs the poll secret", async () => {
		const spies = (["log", "info", "warn", "error", "debug"] as const).map(
			(method) => vi.spyOn(console, method).mockImplementation(() => {})
		);
		const claim = vi.fn(() => Promise.resolve("claimed" as const));
		const response = await pollPairingResponse(
			post("/tv/pair/poll", { pollSecret: SECRET }),
			fakeDeps({ claim })
		);
		const body = (await response.json()) as {
			status: string;
			token: string;
		};
		expect(response.status).toBe(200);
		expect(body.status).toBe("paired");
		expect(body.token).toMatch(/^[0-9a-f]{64}$/);
		const [args] = claim.mock.calls[0] as unknown as [
			{ pollSecretHash: string; tokenHash: string },
		];
		expect(args.tokenHash).toBe(await hashTvSecret(body.token));
		expect(args.pollSecretHash).toBe(await hashTvSecret(SECRET));
		for (const spy of spies) {
			expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
			spy.mockRestore();
		}
	});
});

describe("preflightResponse", () => {
	it("answers 204 with the CORS headers", () => {
		const response = preflightResponse();
		expect(response.status).toBe(204);
		expectCors(response);
	});
});
