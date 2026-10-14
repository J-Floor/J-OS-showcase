import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");

async function seed(
	backend: ReturnType<typeof convexTest>,
	email: string,
	tier: "member" | "board"
) {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "A",
			lastName: "B",
			tier,
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

describe("notification preferences", () => {
	it("lists only the categories the caller's tier can receive, all on by default", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "m@example.org", "member");
		const rows = await backend
			.withIdentity({ email: "m@example.org" })
			.query(api.notify.prefs.mine, {});
		expect(rows).toEqual([
			expect.objectContaining({
				category: "events",
				label: "Events",
				push: true,
				email: false,
				note: "Event reminders are push only.",
			}),
		]);
	});

	it("stores a switch and leaves the other categories at the default", async () => {
		const backend = convexTest(schema, modules);
		const id = await seed(backend, "b@example.org", "board");
		const board = backend.withIdentity({ email: "b@example.org" });
		await board.mutation(api.notify.prefs.set, {
			category: "doors",
			push: false,
			email: true,
		});
		const rows = await board.query(api.notify.prefs.mine, {});
		expect(rows.find((row) => row.category === "doors")).toMatchObject({
			push: false,
			email: true,
		});
		expect(rows.find((row) => row.category === "tasks")).toMatchObject({
			push: true,
			email: true,
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.notificationPrefs).toEqual({
			doors: { push: false, email: true },
		});
	});

	it("refuses a category the caller cannot receive", async () => {
		const backend = convexTest(schema, modules);
		await seed(backend, "m@example.org", "member");
		await expect(
			backend
				.withIdentity({ email: "m@example.org" })
				.mutation(api.notify.prefs.set, {
					category: "doors",
					push: false,
					email: false,
				})
		).rejects.toThrow(/Forbidden/);
	});

	it("pushOnly: mine exposes the flag, set stores email false", async () => {
		const backend = convexTest(schema, modules);
		const id = await seed(backend, "m@example.org", "member");
		const member = backend.withIdentity({ email: "m@example.org" });
		const rows = await member.query(api.notify.prefs.mine, {});
		expect(rows[0]).toMatchObject({
			category: "events",
			pushOnly: true,
			email: false,
		});
		await member.mutation(api.notify.prefs.set, {
			category: "events",
			push: true,
			email: false,
		});
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.notificationPrefs).toEqual({
			events: { push: true, email: false },
		});
	});
});
