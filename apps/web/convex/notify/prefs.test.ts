import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");

async function seed(
	t: ReturnType<typeof convexTest>,
	email: string,
	tier: "member" | "board"
) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
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
		const t = convexTest(schema, modules);
		await seed(t, "m@example.org", "member");
		const rows = await t
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
		const t = convexTest(schema, modules);
		const id = await seed(t, "b@example.org", "board");
		const board = t.withIdentity({ email: "b@example.org" });
		await board.mutation(api.notify.prefs.set, {
			category: "doors",
			push: false,
			email: true,
		});
		const rows = await board.query(api.notify.prefs.mine, {});
		expect(rows.find((r) => r.category === "doors")).toMatchObject({
			push: false,
			email: true,
		});
		expect(rows.find((r) => r.category === "tasks")).toMatchObject({
			push: true,
			email: true,
		});
		const person = await t.run((ctx) => ctx.db.get(id));
		expect(person?.notificationPrefs).toEqual({
			doors: { push: false, email: true },
		});
	});

	it("refuses a category the caller cannot receive", async () => {
		const t = convexTest(schema, modules);
		await seed(t, "m@example.org", "member");
		await expect(
			t
				.withIdentity({ email: "m@example.org" })
				.mutation(api.notify.prefs.set, {
					category: "doors",
					push: false,
					email: false,
				})
		).rejects.toThrow(/Forbidden/);
	});

	it("pushOnly: mine exposes the flag, set stores email false", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t, "m@example.org", "member");
		const member = t.withIdentity({ email: "m@example.org" });
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
		const person = await t.run((ctx) => ctx.db.get(id));
		expect(person?.notificationPrefs).toEqual({
			events: { push: true, email: false },
		});
	});
});
