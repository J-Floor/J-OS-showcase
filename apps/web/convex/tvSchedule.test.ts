import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = ReturnType<typeof convexTest>;

const DAYS = [
	{ day: "mon" as const, closed: false, on: "08:00", off: "18:00" },
	{ day: "tue" as const, closed: true },
];

function seedDevice(
	backend: Backend,
	fields: Partial<{
		tokenHash: string;
		revokedAt: number;
		schedule: typeof DAYS;
		scheduleVersion: number;
	}> = {}
) {
	return backend.run((context) =>
		context.db.insert("tvDevices", {
			tokenHash: "hash",
			label: "TV",
			createdAt: 1,
			...fields,
		})
	);
}

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

function row(
	backend: Backend,
	id: Id<"tvDevices">
): Promise<Doc<"tvDevices"> | null> {
	return backend.run((context) => context.db.get(id));
}

function lookup(backend: Backend, tokenHash: string) {
	return backend.query(internal.tvInternal.deviceSchedule, { tokenHash });
}

describe("internal.tvInternal.deviceSchedule", () => {
	it("is null for an unknown hash", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, { schedule: DAYS, scheduleVersion: 1 });
		expect(await lookup(backend, "nope")).toBeNull();
	});

	it("is null for a revoked device that still holds a schedule", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, {
			schedule: DAYS,
			scheduleVersion: 1,
			revokedAt: 5,
		});
		expect(await lookup(backend, "hash")).toBeNull();
	});

	it("is null for a device without a schedule", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend);
		expect(await lookup(backend, "hash")).toBeNull();
	});

	it("returns the version and days for a device with one", async () => {
		const backend = convexTest(schema, modules);
		await seedDevice(backend, { schedule: DAYS, scheduleVersion: 4 });
		expect(await lookup(backend, "hash")).toEqual({
			version: 4,
			days: DAYS,
		});
	});
});

describe("api.tv.setDeviceSchedule", () => {
	it("refuses a non-board caller", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedPerson(backend, "m@example.com", "member");
		const id = await seedDevice(backend);
		await expect(
			asMember.mutation(api.tv.setDeviceSchedule, { id, days: DAYS })
		).rejects.toThrow("Forbidden");
		const stored = await row(backend, id);
		expect(stored?.schedule).toBeUndefined();
	});

	it("refuses an invalid day list", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend);
		await expect(
			asBoard.mutation(api.tv.setDeviceSchedule, {
				id,
				days: [
					{ day: "mon", closed: false, on: "18:00", off: "08:00" },
				],
			})
		).rejects.toThrow("TvScheduleInvalid");
		const stored = await row(backend, id);
		expect(stored?.scheduleVersion).toBeUndefined();
	});

	it("refuses a revoked device", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend, { revokedAt: 5 });
		await expect(
			asBoard.mutation(api.tv.setDeviceSchedule, { id, days: DAYS })
		).rejects.toThrow("TvDeviceNotFound");
	});

	it("stores a valid list and bumps the version on each save", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend);
		// Out of order on purpose: the stored list is Monday first.
		await asBoard.mutation(api.tv.setDeviceSchedule, {
			id,
			days: [DAYS[1], DAYS[0]],
		});
		const first = await row(backend, id);
		expect(first?.schedule).toEqual(DAYS);
		expect(first?.scheduleVersion).toBe(1);
		await asBoard.mutation(api.tv.setDeviceSchedule, { id, days: DAYS });
		const second = await row(backend, id);
		expect(second?.scheduleVersion).toBe(2);
		const listed = await asBoard.query(api.tv.listDevices, {});
		expect(listed[0].schedule).toEqual(DAYS);
	});

	it("clears the schedule with an empty list and still bumps the version", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend, {
			schedule: DAYS,
			scheduleVersion: 3,
		});
		await asBoard.mutation(api.tv.setDeviceSchedule, { id, days: [] });
		const after = await row(backend, id);
		expect(after?.schedule).toBeUndefined();
		expect(after?.scheduleVersion).toBe(4);
	});
});
