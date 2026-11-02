// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { api, internal } from "./_generated/api";
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

async function insertProject(
	backend: ReturnType<typeof convexTest>,
	name: string
): Promise<Id<"projects">> {
	return backend.run((context) => context.db.insert("projects", { name }));
}

async function insertTasks(
	backend: ReturnType<typeof convexTest>,
	projectId: Id<"projects">,
	count: number
): Promise<void> {
	await backend.run(async (context) => {
		for (let index = 0; index < count; index++) {
			await context.db.insert("tasks", {
				title: `Task ${index}`,
				status: "backlog",
				assigneeIds: [],
				projectId,
			});
		}
	});
}

async function taskCount(
	backend: TestConvex<typeof schema>,
	projectId: Id<"projects">
): Promise<number> {
	const rows = await backend.run((context) =>
		context.db
			.query("tasks")
			.withIndex("by_project", (range) =>
				range.eq("projectId", projectId)
			)
			.collect()
	);
	return rows.length;
}

/** convex-test records a scheduled job when it is queued (see
 *  convex/AGENTS.md), so its name and args prove which function was queued. */
async function detachJobs(backend: ReturnType<typeof convexTest>) {
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	return jobs.filter((job) => job.name === "projects:detachProjectTasks");
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

describe("remove", () => {
	// convex-test arms each scheduled job with a timer. A fake one keeps the
	// detach from running mid-test, so the test drives each batch itself.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("deletes the project at once and detaches its tasks in a scheduled job", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await board(backend);
		const pid = await asBoard.mutation(api.projects.create, { name: "P" });
		const tid = await asBoard.mutation(api.tasks.create, {
			title: "T",
			projectId: pid,
		});

		await asBoard.mutation(api.projects.remove, { id: pid });

		expect(await asBoard.query(api.projects.list, {})).toEqual([]);
		const jobs = await detachJobs(backend);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].args).toEqual([{ projectId: pid }]);

		await backend.mutation(internal.projects.detachProjectTasks, {
			projectId: pid,
		});
		const tasks = await asBoard.query(api.tasks.list, {});
		expect(
			tasks.find((task: { _id: string }) => task._id === tid)?.projectId
		).toBeUndefined();
	});

	test("does nothing for a project that is already gone", async () => {
		const backend = convexTest(schema, modules);
		const asBoard = await board(backend);
		const pid = await asBoard.mutation(api.projects.create, { name: "P" });
		await asBoard.mutation(api.projects.remove, { id: pid });
		await expect(
			asBoard.mutation(api.projects.remove, { id: pid })
		).resolves.toBeNull();
		expect(await detachJobs(backend)).toHaveLength(1);
	});

	test("detaches more than one batch of tasks, and no other project's", async () => {
		const backend = convexTest(schema, modules);
		const pid = await insertProject(backend, "Big");
		const otherId = await insertProject(backend, "Other");
		// One more than a batch of 200, so the first run must hand on.
		await insertTasks(backend, pid, 201);
		await insertTasks(backend, otherId, 1);

		await backend.mutation(internal.projects.detachProjectTasks, {
			projectId: pid,
		});

		expect(await taskCount(backend, pid)).toBe(1);
		const handedOn = await detachJobs(backend);
		expect(handedOn).toHaveLength(1);
		expect(handedOn[0].args).toEqual([{ projectId: pid }]);

		// The rescheduled run, driven by hand: a short batch ends the chain.
		await backend.mutation(internal.projects.detachProjectTasks, {
			projectId: pid,
		});

		expect(await taskCount(backend, pid)).toBe(0);
		expect(await detachJobs(backend)).toHaveLength(1);
		expect(await taskCount(backend, otherId)).toBe(1);
	});
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
