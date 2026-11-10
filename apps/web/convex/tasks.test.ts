// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

async function seedBoard(backend: ReturnType<typeof convexTest>) {
	const boardId = await backend.run((context) =>
		context.db.insert("people", {
			email: "b@example.org",
			firstName: "B",
			lastName: "O",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return { board: backend.withIdentity({ email: "b@example.org" }), boardId };
}

async function seedAssignee(
	backend: ReturnType<typeof convexTest>
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email: "a@example.org",
			firstName: "A",
			lastName: "Z",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		})
	);
}

test("create defaults to backlog + empty assignees, then list returns it", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	const id = await board.mutation(api.tasks.create, { title: "Ship it" });
	const tasks = await board.query(api.tasks.list, {});
	expect(tasks).toHaveLength(1);
	expect(tasks[0]).toMatchObject({
		_id: id,
		title: "Ship it",
		status: "backlog",
		assigneeIds: [],
	});
});

test("update patches status", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	const id = await board.mutation(api.tasks.create, { title: "Move me" });
	await board.mutation(api.tasks.update, { id, status: "in_progress" });
	const tasks = await board.query(api.tasks.list, {});
	expect(tasks[0].status).toBe("in_progress");
});

test("non-board is forbidden", async () => {
	const backend = convexTest(schema, modules);
	await backend.run(async (context) => {
		await context.db.insert("people", {
			email: "m@example.org",
			firstName: "M",
			lastName: "E",
			tier: "member",
			stage: "active",
			stageSince: Date.now(),
		});
	});
	const member = backend.withIdentity({ email: "m@example.org" });
	await expect(member.query(api.tasks.list, {})).rejects.toThrow(/Forbidden/);
});

async function taskAssignedRows(
	backend: ReturnType<typeof convexTest>
): Promise<Doc<"notifications">[]> {
	const rows = (await backend.run((context) =>
		context.db.query("notifications").take(10)
	)) as Doc<"notifications">[];
	return rows.filter((row) => row.kind === "taskAssigned");
}

test("create notifies a newly-assigned person", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	const assigneeId = await seedAssignee(backend);
	await runAndCollectLogs(backend, () =>
		board.mutation(api.tasks.create, {
			title: "Wire it",
			assigneeIds: [assigneeId],
		})
	);
	expect(await taskAssignedRows(backend)).toEqual([
		expect.objectContaining({ personId: assigneeId, body: "Wire it" }),
	]);
});

test("update notifies only the newly-added assignee", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	const assigneeId = await seedAssignee(backend);
	const id = await board.mutation(api.tasks.create, { title: "Grow it" });
	await runAndCollectLogs(backend, () =>
		board.mutation(api.tasks.update, { id, assigneeIds: [assigneeId] })
	);
	expect(await taskAssignedRows(backend)).toEqual([
		expect.objectContaining({ personId: assigneeId, body: "Grow it" }),
	]);
});

test("does not notify the actor for a self-assignment", async () => {
	const backend = convexTest(schema, modules);
	const { board, boardId } = await seedBoard(backend);
	await runAndCollectLogs(backend, () =>
		board.mutation(api.tasks.create, {
			title: "Mine",
			assigneeIds: [boardId],
		})
	);
	expect(await taskAssignedRows(backend)).toEqual([]);
});

test("the assignment notification deep-links to the task, not the board", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	const assigneeId = await seedAssignee(backend);
	const id = await board.mutation(api.tasks.create, {
		title: "Wire it",
		assigneeIds: [assigneeId],
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
						kind: "taskAssigned",
						payload: {
							assigneeId,
							taskId: id,
							taskTitle: "Wire it",
						},
					},
				],
			}),
		])
	);
});

test("create and update reject an over-long title or description", async () => {
	const backend = convexTest(schema, modules);
	const { board } = await seedBoard(backend);
	await expect(
		board.mutation(api.tasks.create, { title: "t".repeat(201) })
	).rejects.toThrow(/FieldTooLong/);
	await expect(
		board.mutation(api.tasks.create, {
			title: "ok",
			description: "d".repeat(5001),
		})
	).rejects.toThrow(/FieldTooLong/);
	const id = await board.mutation(api.tasks.create, { title: "Fine" });
	await expect(
		board.mutation(api.tasks.update, { id, title: "t".repeat(201) })
	).rejects.toThrow(/FieldTooLong/);
	await expect(
		board.mutation(api.tasks.update, { id, description: "d".repeat(5001) })
	).rejects.toThrow(/FieldTooLong/);
});
