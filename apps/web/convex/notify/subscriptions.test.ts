import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema.ts";

import { MAX_SUBSCRIPTIONS_PER_PERSON } from "./subscriptions.ts";

const modules = import.meta.glob("/convex/**/*.*s");

async function seed(backend: ReturnType<typeof convexTest>, email: string) {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "A",
			lastName: "B",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

const SUB = {
	endpoint: "https://fcm.googleapis.com/fcm/send/abc",
	p256dh: "p",
	auth: "a",
	userAgent: "test-agent",
};

async function rows(backend: ReturnType<typeof convexTest>) {
	return backend.run((context) =>
		context.db.query("pushSubscriptions").collect()
	);
}

describe("push subscriptions", () => {
	it("stores a subscription for the signed-in person", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seed(backend, "ada@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		const all = await rows(backend);
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ ...SUB, personId: ada });
	});

	it("re-assigns an endpoint to whoever subscribes from that device next", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		const bob = await seed(backend, "bob@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		await backend
			.withIdentity({ email: "bob@example.org" })
			.mutation(api.notify.subscriptions.subscribe, {
				...SUB,
				auth: "a2",
			});
		const all = await rows(backend);
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ personId: bob, auth: "a2" });
	});

	it("rejects people without an access tier", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "p@example.org",
				firstName: "P",
				lastName: "R",
				tier: "prospect",
				stage: "queued",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "p@example.org" })
				.mutation(api.notify.subscriptions.subscribe, SUB)
		).rejects.toThrow();
	});

	it("rejects staff, who get no notifications", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "s@example.org",
				firstName: "S",
				lastName: "T",
				tier: "staff",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "s@example.org" })
				.mutation(api.notify.subscriptions.subscribe, SUB)
		).rejects.toThrow("Forbidden");
		expect(await rows(backend)).toHaveLength(0);
	});

	it("unsubscribe deletes only the caller's own row", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		await seed(backend, "bob@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		await backend
			.withIdentity({ email: "bob@example.org" })
			.mutation(api.notify.subscriptions.unsubscribe, {
				endpoint: SUB.endpoint,
			});
		expect(await rows(backend)).toHaveLength(1);
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.unsubscribe, {
				endpoint: SUB.endpoint,
			});
		expect(await rows(backend)).toHaveLength(0);
	});

	it("removeByEndpoint deletes regardless of owner", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		await backend.mutation(internal.notify.subscriptions.removeByEndpoint, {
			endpoint: SUB.endpoint,
		});
		expect(await rows(backend)).toHaveLength(0);
	});

	it.each([
		[
			"an http endpoint",
			// eslint-disable-next-line sonarjs/no-clear-text-protocols -- the fixture is the insecure endpoint the allowlist must reject
			{ endpoint: "http://fcm.googleapis.com/fcm/send/abc" },
		],
		["an off-allowlist host", { endpoint: "https://evil.example/abc" }],
		[
			"a look-alike suffix host",
			{ endpoint: "https://fcm.googleapis.com.evil.example/abc" },
		],
		["an unparseable endpoint", { endpoint: "not a url" }],
		[
			"an overlong endpoint",
			{ endpoint: `https://fcm.googleapis.com/${"a".repeat(2048)}` },
		],
		["an overlong p256dh", { p256dh: "p".repeat(257) }],
		["an overlong auth", { auth: "a".repeat(65) }],
	])("rejects %s", async (_name, override) => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		await expect(
			backend
				.withIdentity({ email: "ada@example.org" })
				.mutation(api.notify.subscriptions.subscribe, {
					...SUB,
					...override,
				})
		).rejects.toThrow("InvalidPushEndpoint");
		expect(await rows(backend)).toHaveLength(0);
	});

	it.each([
		"https://web.push.apple.com/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://wns2-par02p.notify.windows.com/w/?token=abc",
	])("accepts the allowlisted endpoint %s", async (endpoint) => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, { ...SUB, endpoint });
		expect(await rows(backend)).toHaveLength(1);
	});

	it("keeps only the newest subscriptions per person", async () => {
		const backend = convexTest(schema, modules);
		const ada = await seed(backend, "ada@example.org");
		await backend.run(async (context) => {
			for (
				let index = 0;
				index < MAX_SUBSCRIPTIONS_PER_PERSON;
				index += 1
			) {
				await context.db.insert("pushSubscriptions", {
					personId: ada,
					endpoint: `https://fcm.googleapis.com/fcm/send/old${String(index)}`,
					p256dh: "p",
					auth: "a",
					userAgent: "test",
					createdAt: index + 1,
				});
			}
		});
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		const all = await rows(backend);
		expect(all).toHaveLength(MAX_SUBSCRIPTIONS_PER_PERSON);
		const endpoints = all.map((row: { endpoint: string }) => row.endpoint);
		expect(endpoints).toContain(SUB.endpoint);
		expect(endpoints).not.toContain(
			"https://fcm.googleapis.com/fcm/send/old0"
		);
		expect(endpoints).toContain("https://fcm.googleapis.com/fcm/send/old1");
	});

	it("re-assigning a device into a full person keeps the re-registered device", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "ada@example.org");
		const bob = await seed(backend, "bob@example.org");
		await backend
			.withIdentity({ email: "ada@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		await backend.run(async (context) => {
			const [moved] = await context.db
				.query("pushSubscriptions")
				.collect();
			await context.db.patch(moved._id, { createdAt: 1 });
			for (
				let index = 0;
				index < MAX_SUBSCRIPTIONS_PER_PERSON;
				index += 1
			) {
				await context.db.insert("pushSubscriptions", {
					personId: bob,
					endpoint: `https://fcm.googleapis.com/fcm/send/bob${String(index)}`,
					p256dh: "p",
					auth: "a",
					userAgent: "test",
					createdAt: 100 + index,
				});
			}
		});
		await backend
			.withIdentity({ email: "bob@example.org" })
			.mutation(api.notify.subscriptions.subscribe, SUB);
		const allRows = await rows(backend);
		const mine = allRows.filter(
			(row: { personId: unknown }) => row.personId === bob
		);
		expect(mine).toHaveLength(MAX_SUBSCRIPTIONS_PER_PERSON);
		expect(mine.map((row: { endpoint: string }) => row.endpoint)).toContain(
			SUB.endpoint
		);
	});
});
