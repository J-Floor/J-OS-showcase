import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { createFunctionHandle } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { seedLogin } from "../test-stubs/logins.ts";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authUserById, linkLogin, renameLogin } from "./lib/authRecords.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function setup() {
	const backend = convexTest(schema, modules);
	betterAuthTest.register(backend);
	rateLimiterTest.register(backend);
	return backend;
}
type Backend = ReturnType<typeof setup>;

async function seedPerson(
	backend: Backend,
	email: string,
	authUserId?: string
) {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Link",
			lastName: "Person",
			tier: "member",
			stage: "active",
			stageSince: 1,
			...(authUserId === undefined ? {} : { authUserId }),
		})
	);
}

async function authUserIdOf(backend: Backend, id: Id<"people">) {
	// `run` carries results as JSON, where `undefined` comes back as null.
	const linked = await backend.run(async (context) => {
		const person = await context.db.get(id);
		return person?.authUserId;
	});
	return linked ?? undefined;
}

describe("linkLogin", () => {
	it("links the person whose email the login holds", async () => {
		const backend = setup();
		const personId = await seedPerson(backend, "ada@example.com");
		const userId = await seedLogin(backend, "ada@example.com");
		const outcome = await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!)
		);
		expect(outcome).toBe("linked");
		expect(await authUserIdOf(backend, personId)).toBe(userId);
	});

	it("leaves an already linked person alone", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "ada@example.com");
		await seedPerson(backend, "ada@example.com", userId);
		const outcome = await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!)
		);
		expect(outcome).toBe("unchanged");
	});

	it("reports a login no person holds", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "nobody@example.com");
		const outcome = await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!)
		);
		expect(outcome).toBe("noPerson");
	});

	it("moves the link off any other person holding it", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "ada@example.com");
		const staleId = await seedPerson(backend, "old@example.com", userId);
		const personId = await seedPerson(backend, "ada@example.com");
		await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!)
		);
		expect(await authUserIdOf(backend, staleId)).toBeUndefined();
		expect(await authUserIdOf(backend, personId)).toBe(userId);
	});

	it("writes nothing on a dry run", async () => {
		const backend = setup();
		const personId = await seedPerson(backend, "ada@example.com");
		const userId = await seedLogin(backend, "ada@example.com");
		const outcome = await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!, {
				dryRun: true,
			})
		);
		expect(outcome).toBe("linked");
		expect(await authUserIdOf(backend, personId)).toBeUndefined();
	});

	it("matches the person's email case-insensitively", async () => {
		const backend = setup();
		const personId = await seedPerson(backend, "ada@example.com");
		const userId = await seedLogin(backend, "Ada@Example.com");
		await backend.run(async (context) =>
			linkLogin(context, (await authUserById(context, userId))!)
		);
		expect(await authUserIdOf(backend, personId)).toBe(userId);
	});
});

describe("session onCreate trigger", () => {
	it("links the signing-in person", async () => {
		const backend = setup();
		const personId = await seedPerson(backend, "ada@example.com");
		const userId = await seedLogin(backend, "ada@example.com");
		await backend.mutation(internal.auth.onCreate, {
			model: "session",
			doc: {
				_id: "session-1",
				_creationTime: 1,
				token: "t",
				userId,
				expiresAt: 2,
				createdAt: 1,
				updatedAt: 1,
			},
		});
		expect(await authUserIdOf(backend, personId)).toBe(userId);
	});

	it("ignores a session whose user is gone", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "gone@example.com");
		await backend.mutation(components.betterAuth.adapter.deleteMany, {
			input: { model: "user", where: [{ field: "_id", value: userId }] },
			paginationOpts: { cursor: null, numItems: 10 },
		});
		await expect(
			backend.mutation(internal.auth.onCreate, {
				model: "session",
				doc: {
					_id: "session-1",
					_creationTime: 1,
					token: "t",
					userId,
					expiresAt: 2,
					createdAt: 1,
					updatedAt: 1,
				},
			})
		).resolves.toBeNull();
	});

	it("runs when a session is created through the component", async () => {
		const backend = setup();
		const personId = await seedPerson(backend, "ada@example.com");
		const userId = await seedLogin(backend, "ada@example.com");
		await backend.run(async (context) => {
			const handle = await createFunctionHandle(internal.auth.onCreate);
			await context.runMutation(components.betterAuth.adapter.create, {
				input: {
					model: "session",
					data: {
						token: "t",
						userId,
						expiresAt: 2,
						createdAt: 1,
						updatedAt: 1,
					},
				},
				onCreateHandle: handle,
			});
		});
		expect(await authUserIdOf(backend, personId)).toBe(userId);
	});
});

describe("renameLogin", () => {
	it("moves the login to the new address", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "ada@example.com");
		await backend.run((context) =>
			renameLogin(context, userId, " Ada.New@Example.com ")
		);
		const user = await backend.run((context) =>
			authUserById(context, userId)
		);
		expect(user?.email).toBe("ada.new@example.com");
	});

	it("clears any person still linked to a stray login it erases", async () => {
		const backend = setup();
		const userId = await seedLogin(backend, "ada@example.com");
		const strayId = await seedLogin(backend, "ada.new@example.com");
		const other = await seedPerson(backend, "other@example.com", strayId);

		await backend.run((context) =>
			renameLogin(context, userId, "ada.new@example.com")
		);

		expect(await authUserIdOf(backend, other)).toBeUndefined();
		expect(
			await backend.run((context) => authUserById(context, strayId))
		).toBeNull();
		const renamed = await backend.run((context) =>
			authUserById(context, userId)
		);
		expect(renamed?.email).toBe("ada.new@example.com");
	});
});
