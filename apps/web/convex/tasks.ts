import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { assertLen, NAME_MAX, TEXT_MAX } from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { taskStatus } from "./schema.ts";

// Notify everyone newly added to a task's assignees (skipping the actor, who
// doesn't need to be told about their own action).
async function notifyNewTaskAssignees(
	ctx: MutationCtx,
	taskId: Id<"tasks">,
	title: string,
	before: readonly Id<"people">[],
	after: readonly Id<"people">[],
	actorId: Id<"people">
): Promise<void> {
	const had = new Set<string>(before);
	for (const assigneeId of after) {
		if (had.has(assigneeId) || assigneeId === actorId) continue;
		await notify(ctx, "taskAssigned", {
			assigneeId,
			taskId,
			taskTitle: title,
		});
	}
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		// Core members can view and manage the Tasks board
		// (create/update/remove) alongside the board.
		await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		return ctx.db.query("tasks").collect();
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
	handler: async (ctx, args) => {
		const person = await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		assertLen(args.title, NAME_MAX, "Title");
		assertLen(args.description, TEXT_MAX, "Description");
		const assigneeIds = args.assigneeIds ?? [];
		const id = await ctx.db.insert("tasks", {
			title: args.title,
			description: args.description,
			status: args.status ?? "backlog",
			assigneeIds,
			projectId: args.projectId,
			dueDate: args.dueDate,
			createdBy: person._id,
		});
		await notifyNewTaskAssignees(
			ctx,
			id,
			args.title,
			[],
			assigneeIds,
			person._id
		);
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
	handler: async (ctx, { id, ...patch }) => {
		const person = await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		assertLen(patch.title, NAME_MAX, "Title");
		assertLen(patch.description, TEXT_MAX, "Description");
		// null clears an optional field; undefined leaves it untouched.
		const clean: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(patch)) {
			clean[k] = val ?? undefined;
		}
		// Capture the prior assignees BEFORE patching so we can email only the
		// people newly added in this update.
		const prior =
			patch.assigneeIds !== undefined ? await ctx.db.get(id) : null;
		await ctx.db.patch(id, clean);
		if (patch.assigneeIds !== undefined && prior) {
			await notifyNewTaskAssignees(
				ctx,
				id,
				(clean.title as string | undefined) ?? prior.title,
				prior.assigneeIds,
				patch.assigneeIds,
				person._id
			);
		}
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		await ctx.db.delete(id);
		return null;
	},
});
