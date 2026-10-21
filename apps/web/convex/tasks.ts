// jscpd:ignore-start -- an import block: the module system and import-x/order fix its shape, and projects.ts needs the same dependencies
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { unwrap } from "./lib/result.ts";
import { CORE_AND_BOARD } from "./lib/roles.ts";
import {
	checkLength,
	NAME_MAX,
	TEXT_MAX,
	withNullsCleared,
} from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { taskStatus } from "./schema.ts";
// jscpd:ignore-end

// Notify everyone newly added to a task's assignees (skipping the actor, who
// doesn't need to be told about their own action).
async function notifyNewTaskAssignees(
	context: MutationCtx,
	{
		taskId,
		title,
		before,
		after,
		actorId,
	}: {
		taskId: Id<"tasks">;
		title: string;
		before: readonly Id<"people">[];
		after: readonly Id<"people">[];
		actorId: Id<"people">;
	}
): Promise<void> {
	const had = new Set<string>(before);
	for (const assigneeId of after) {
		if (had.has(assigneeId) || assigneeId === actorId) continue;
		await notify(context, "taskAssigned", {
			assigneeId,
			taskId,
			taskTitle: title,
		});
	}
}

export const list = query({
	args: {},
	handler: async (context) => {
		// Core members can view and manage the Tasks board
		// (create/update/remove) alongside the board.
		unwrap(await requireRole(context, CORE_AND_BOARD));
		return context.db.query("tasks").collect();
	},
});

export const create = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(taskStatus),
		assigneeIds: v.optional(v.array(v.id("people"))),
		projectId: v.optional(v.id("projects")),
		dueDate: v.optional(v.number()),
	},
	handler: async (context, args) => {
		const person = unwrap(await requireRole(context, CORE_AND_BOARD));
		unwrap(checkLength(args.title, NAME_MAX));
		unwrap(checkLength(args.description, TEXT_MAX));
		const assigneeIds = args.assigneeIds ?? [];
		const id = await context.db.insert("tasks", {
			title: args.title,
			description: args.description,
			status: args.status ?? "backlog",
			assigneeIds,
			projectId: args.projectId,
			dueDate: args.dueDate,
			createdBy: person._id,
		});
		await notifyNewTaskAssignees(context, {
			taskId: id,
			title: args.title,
			before: [],
			after: assigneeIds,
			actorId: person._id,
		});
		return id;
	},
});

export const update = mutation({
	args: {
		id: v.id("tasks"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(taskStatus),
		assigneeIds: v.optional(v.array(v.id("people"))),
		projectId: v.optional(v.union(v.id("projects"), v.null())),
		dueDate: v.optional(v.union(v.number(), v.null())),
	},
	handler: async (context, { id, ...patch }) => {
		const person = unwrap(await requireRole(context, CORE_AND_BOARD));
		unwrap(checkLength(patch.title, NAME_MAX));
		unwrap(checkLength(patch.description, TEXT_MAX));
		const clean = withNullsCleared(patch);
		// Capture the prior assignees BEFORE patching so we can email only the
		// people newly added in this update.
		const prior =
			patch.assigneeIds === undefined ? null : await context.db.get(id);
		await context.db.patch(id, clean);
		if (patch.assigneeIds !== undefined && prior) {
			await notifyNewTaskAssignees(context, {
				taskId: id,
				title: (clean.title as string | undefined) ?? prior.title,
				before: prior.assigneeIds,
				after: patch.assigneeIds,
				actorId: person._id,
			});
		}
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("tasks") },
	handler: async (context, { id }) => {
		unwrap(await requireRole(context, CORE_AND_BOARD));
		await context.db.delete(id);
		return null;
	},
});
