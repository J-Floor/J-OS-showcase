// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

async function board(t: ReturnType<typeof convexTest>) {
	await t.run(async (ctx) => {
		await ctx.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		});
	});
	return t.withIdentity({ email: "b@example.org" });
}

async function seedLeader(
	t: ReturnType<typeof convexTest>
): Promise<Id<"people">> {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email: "lead@example.org",
			firstName: "L",
			lastName: "D",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

test("create + list", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const id = await b.mutation(api.projects.create, { name: "Launch" });
	const list = await b.query(api.projects.list, {});
	expect(list).toHaveLength(1);
	expect(list[0]).toMatchObject({ _id: id, name: "Launch" });
});

test("rejects start date after end date on create and update", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const start = Date.parse("2026-06-10");
	const end = Date.parse("2026-06-05");
	await expect(
		b.mutation(api.projects.create, {
			name: "Bad",
			startDate: start,
			endDate: end,
		})
	).rejects.toThrow(/start date must be on or before/i);

	// A valid project (start 06-05 ≤ end 06-10), then an update pushing the start
	// past the end is rejected.
	const id = await b.mutation(api.projects.create, {
		name: "Ok",
		startDate: end,
		endDate: start,
	});
	await expect(
		b.mutation(api.projects.update, {
			id,
			startDate: Date.parse("2026-06-20"),
		})
	).rejects.toThrow(/start date must be on or before/i);
});

test("emails a leader assigned on create", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const leaderId = await seedLeader(t);
	const logs = await runAndCollectLogs(t, () =>
		b.mutation(api.projects.create, { name: "Apollo", leaderId })
	);
	expect(
		logs.some(
			(m) =>
				m.includes("[notify:projectAssigned]") &&
				m.includes("lead@example.org") &&
				m.includes("Apollo")
		)
	).toBe(true);
});

test("emails a leader newly set on update", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const leaderId = await seedLeader(t);
	const id = await b.mutation(api.projects.create, { name: "Gemini" });
	const logs = await runAndCollectLogs(t, () =>
		b.mutation(api.projects.update, { id, leaderId })
	);
	expect(logs.some((m) => m.includes("[notify:projectAssigned]"))).toBe(true);
});

test("remove detaches its tasks", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const pid = await b.mutation(api.projects.create, { name: "P" });
	const tid = await b.mutation(api.tasks.create, {
		title: "T",
		projectId: pid,
	});
	await b.mutation(api.projects.remove, { id: pid });
	const tasks = await b.query(api.tasks.list, {});
	expect(
		tasks.find((x: { _id: string }) => x._id === tid)?.projectId
	).toBeUndefined();
});

test("the leader email deep-links to the project, not the timeline", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	const leaderId = await seedLeader(t);
	const id = await b.mutation(api.projects.create, {
		name: "Apollo",
		leaderId,
	});
	const jobs = await t.run((ctx) =>
		ctx.db.system.query("_scheduled_functions").collect()
	);
	expect(jobs).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: "notify/dispatch:run",
				args: [
					{
						kind: "projectAssigned",
						payload: {
							leaderId,
							projectId: id,
							projectName: "Apollo",
						},
					},
				],
			}),
		])
	);
});

test("create and update reject an over-long name or description", async () => {
	const t = convexTest(schema, modules);
	const b = await board(t);
	await expect(
		b.mutation(api.projects.create, { name: "n".repeat(201) })
	).rejects.toThrow("Project name is too long (max 200 characters).");
	await expect(
		b.mutation(api.projects.create, {
			name: "ok",
			description: "d".repeat(5001),
		})
	).rejects.toThrow("Description is too long (max 5000 characters).");
	const id = await b.mutation(api.projects.create, { name: "Fine" });
	await expect(
		b.mutation(api.projects.update, { id, name: "n".repeat(201) })
	).rejects.toThrow("Project name is too long (max 200 characters).");
	await expect(
		b.mutation(api.projects.update, { id, description: "d".repeat(5001) })
	).rejects.toThrow("Description is too long (max 5000 characters).");
});
