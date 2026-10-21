// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

async function board(backend: ReturnType<typeof convexTest>) {
	await backend.run(async (context) => {
		await context.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		});
	});
	return backend.withIdentity({ email: "b@example.org" });
}

async function seedLeader(
	backend: ReturnType<typeof convexTest>
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
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
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const id = await asBoard.mutation(api.projects.create, { name: "Launch" });
	const list = await asBoard.query(api.projects.list, {});
	expect(list).toHaveLength(1);
	expect(list[0]).toMatchObject({ _id: id, name: "Launch" });
});

test("rejects start date after end date on create and update", async () => {
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const start = Date.parse("2026-06-10");
	const end = Date.parse("2026-06-05");
	await expect(
		asBoard.mutation(api.projects.create, {
			name: "Bad",
			startDate: start,
			endDate: end,
		})
	).rejects.toThrow(/ProjectDatesOutOfOrder/);

	// A valid project (start 06-05 ≤ end 06-10), then an update pushing the start
	// past the end is rejected.
	const id = await asBoard.mutation(api.projects.create, {
		name: "Ok",
		startDate: end,
		endDate: start,
	});
	await expect(
		asBoard.mutation(api.projects.update, {
			id,
			startDate: Date.parse("2026-06-20"),
		})
	).rejects.toThrow(/ProjectDatesOutOfOrder/);
});

test("emails a leader assigned on create", async () => {
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const leaderId = await seedLeader(backend);
	const logs = await runAndCollectLogs(backend, () =>
		asBoard.mutation(api.projects.create, { name: "Apollo", leaderId })
	);
	expect(
		logs.some(
			(message) =>
				message.includes("[notify:projectAssigned]") &&
				message.includes("lead@example.org") &&
				message.includes("Apollo")
		)
	).toBe(true);
});

test("emails a leader newly set on update", async () => {
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const leaderId = await seedLeader(backend);
	const id = await asBoard.mutation(api.projects.create, { name: "Gemini" });
	const logs = await runAndCollectLogs(backend, () =>
		asBoard.mutation(api.projects.update, { id, leaderId })
	);
	expect(
		logs.some((message) => message.includes("[notify:projectAssigned]"))
	).toBe(true);
});

test("remove detaches its tasks", async () => {
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const pid = await asBoard.mutation(api.projects.create, { name: "P" });
	const tid = await asBoard.mutation(api.tasks.create, {
		title: "T",
		projectId: pid,
	});
	await asBoard.mutation(api.projects.remove, { id: pid });
	const tasks = await asBoard.query(api.tasks.list, {});
	expect(
		tasks.find((task: { _id: string }) => task._id === tid)?.projectId
	).toBeUndefined();
});

test("the leader email deep-links to the project, not the timeline", async () => {
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	const leaderId = await seedLeader(backend);
	const id = await asBoard.mutation(api.projects.create, {
		name: "Apollo",
		leaderId,
	});
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
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
	const backend = convexTest(schema, modules);
	const asBoard = await board(backend);
	await expect(
		asBoard.mutation(api.projects.create, { name: "n".repeat(201) })
	).rejects.toThrow(/FieldTooLong/);
	await expect(
		asBoard.mutation(api.projects.create, {
			name: "ok",
			description: "d".repeat(5001),
		})
	).rejects.toThrow(/FieldTooLong/);
	const id = await asBoard.mutation(api.projects.create, { name: "Fine" });
	await expect(
		asBoard.mutation(api.projects.update, { id, name: "n".repeat(201) })
	).rejects.toThrow(/FieldTooLong/);
	await expect(
		asBoard.mutation(api.projects.update, {
			id,
			description: "d".repeat(5001),
		})
	).rejects.toThrow(/FieldTooLong/);
});
