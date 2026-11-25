import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = ReturnType<typeof convexTest>;

function seedDevice(
	backend: Backend,
	fields: Partial<{ revokedAt: number; label: string }> = {}
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

function exists(backend: Backend, id: Id<"tvDevices">): Promise<boolean> {
	return backend.run(async (context) => (await context.db.get(id)) !== null);
}

describe("tv.deleteDevice", () => {
	it("deletes a revoked device so it is no longer listed", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const gone = await seedDevice(backend, {
			revokedAt: 5,
			label: "Old TV",
		});
		const kept = await seedDevice(backend, { label: "Live TV" });
		await asBoard.mutation(api.tv.deleteDevice, { id: gone });
		const listed = await asBoard.query(api.tv.listDevices, {});
		expect(listed.map((device) => device._id)).toEqual([kept]);
		expect(await exists(backend, gone)).toBe(false);
	});

	it("refuses a live device and leaves it in place", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend);
		await expect(
			asBoard.mutation(api.tv.deleteDevice, { id })
		).rejects.toThrow("TvDeviceNotRevoked");
		expect(await exists(backend, id)).toBe(true);
	});

	it("refuses a non-board caller and leaves the device in place", async () => {
		const backend = convexTest(schema, modules);
		const asMember = await seedPerson(backend, "m@example.com", "member");
		const id = await seedDevice(backend, { revokedAt: 5 });
		await expect(
			asMember.mutation(api.tv.deleteDevice, { id })
		).rejects.toThrow("Forbidden");
		expect(await exists(backend, id)).toBe(true);
	});

	it("refuses an unknown id with TvDeviceNotFound", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await seedPerson(backend, "b@example.com", "board");
		const id = await seedDevice(backend, { revokedAt: 5 });
		await backend.run((context) => context.db.delete(id));
		await expect(
			asBoard.mutation(api.tv.deleteDevice, { id })
		).rejects.toThrow("TvDeviceNotFound");
	});
});
