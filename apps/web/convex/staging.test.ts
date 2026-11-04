import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema.ts";
import { STAGING_SITE_URL } from "./staging.ts";

const modules = import.meta.glob("./**/*.*s");

/** Every table the seed writes. */
const SEEDED_TABLES = [
	"people",
	"perks",
	"perkRequests",
	"events",
	"eventAttendance",
	"projects",
	"tasks",
	"itemCategories",
	"itemTypes",
	"items",
	"wifiConfig",
] as const;

function newBackend() {
	return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

function snapshot(backend: Backend) {
	return backend.run(async (context) => {
		const tables: Record<string, unknown[]> = {};
		for (const table of SEEDED_TABLES)
			tables[table] = await context.db.query(table).collect();
		return tables;
	});
}

function personWithEmail(backend: Backend, email: string) {
	return backend.run((context) =>
		context.db
			.query("people")
			.withIndex("by_email", (range) => range.eq("email", email))
			.unique()
	);
}

describe("staging.seed", () => {
	beforeEach(() => {
		vi.stubEnv("SITE_URL", STAGING_SITE_URL);
		vi.stubEnv("EMAIL_ALLOWLIST", " Owner@Example.com ,second@example.com");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("refuses to run anywhere but the staging site, and writes nothing", async () => {
		vi.stubEnv("SITE_URL", "http://localhost:5173");
		const backend = newBackend();
		await expect(
			backend.mutation(internal.staging.seed, {})
		).rejects.toThrow(STAGING_SITE_URL);
		const tables = await snapshot(backend);
		for (const table of SEEDED_TABLES) expect(tables[table]).toEqual([]);
	});

	it("refuses without EMAIL_ALLOWLIST, which the board accounts come from", async () => {
		vi.stubEnv("EMAIL_ALLOWLIST", "");
		const backend = newBackend();
		await expect(
			backend.mutation(internal.staging.seed, {})
		).rejects.toThrow("EMAIL_ALLOWLIST");
	});

	it("creates an active board account for every allowlisted address", async () => {
		const backend = newBackend();
		await backend.mutation(internal.staging.seed, {});
		for (const email of ["owner@example.com", "second@example.com"])
			expect(await personWithEmail(backend, email)).toMatchObject({
				tier: "board",
				stage: "active",
			});
	});

	it("creates the example data on example.com people", async () => {
		const backend = newBackend();
		await backend.mutation(internal.staging.seed, {});
		const tables = await snapshot(backend);
		expect(tables.perks).toHaveLength(2);
		expect(tables.perkRequests).toHaveLength(2);
		expect(tables.events).toHaveLength(1);
		expect(tables.eventAttendance).toHaveLength(1);
		expect(tables.projects).toHaveLength(1);
		expect(tables.tasks).toHaveLength(2);
		expect(tables.itemCategories.length).toBeGreaterThan(0);
		expect(tables.itemTypes.length).toBeGreaterThan(0);
		expect(tables.items.length).toBeGreaterThan(0);
		expect(tables.wifiConfig).toHaveLength(1);
		for (const person of tables.people as { email: string }[])
			expect(person.email).toMatch(/@example\.com$/);
	});

	it("changes nothing on a second run", async () => {
		const backend = newBackend();
		await backend.mutation(internal.staging.seed, {});
		const first = await snapshot(backend);
		await backend.mutation(internal.staging.seed, {});
		expect(await snapshot(backend)).toEqual(first);
	});

	it("adds only the new board account when the allowlist grows", async () => {
		vi.stubEnv("EMAIL_ALLOWLIST", "owner@example.com");
		const backend = newBackend();
		await backend.mutation(internal.staging.seed, {});
		const before = await snapshot(backend);
		vi.stubEnv("EMAIL_ALLOWLIST", "owner@example.com,third@example.com");
		await backend.mutation(internal.staging.seed, {});
		const after = await snapshot(backend);
		expect(
			await personWithEmail(backend, "third@example.com")
		).toMatchObject({ tier: "board", stage: "active" });
		expect(after.people).toEqual([
			...before.people,
			await personWithEmail(backend, "third@example.com"),
		]);
		for (const table of SEEDED_TABLES.filter((name) => name !== "people"))
			expect(after[table]).toEqual(before[table]);
	});

	it("leaves an allowlisted address that already has an account as it is", async () => {
		const backend = newBackend();
		await backend.run((context) =>
			context.db.insert("people", {
				email: "second@example.com",
				firstName: "Sam",
				lastName: "Second",
				tier: "member",
				stage: "active",
				stageSince: 1,
				provenance: "seed",
				door: { override: "none" },
			})
		);
		const before = await personWithEmail(backend, "second@example.com");
		await backend.mutation(internal.staging.seed, {});
		expect(await personWithEmail(backend, "second@example.com")).toEqual(
			before
		);
	});
});
