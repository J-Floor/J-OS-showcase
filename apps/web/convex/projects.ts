import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { assertLength, NAME_MAX, TEXT_MAX } from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { projectFields } from "./schema.ts";

const DATE_ORDER_ERROR = "Project start date must be on or before its end date";

function assertDateOrder(start?: number, end?: number): void {
	if (start !== undefined && end !== undefined && start > end) {
		throw new Error(DATE_ORDER_ERROR);
	}
}

// Notify a newly-assigned project lead (skipping the actor assigning
// themselves). `prevLeaderId` is undefined on create.
async function notifyNewProjectLeader(
	context: MutationCtx,
	{
		projectId,
		projectName,
		prevLeaderId,
		nextLeaderId,
		actorId,
	}: {
		projectId: Id<"projects">;
		projectName: string;
		prevLeaderId: Id<"people"> | undefined;
		nextLeaderId: Id<"people"> | undefined;
		actorId: Id<"people">;
	}
): Promise<void> {
	if (
		!nextLeaderId ||
		nextLeaderId === prevLeaderId ||
		nextLeaderId === actorId
	)
		return;
	await notify(context, "projectAssigned", {
		leaderId: nextLeaderId,
		projectId,
		projectName,
	});
}

export const list = query({
	args: {},
	handler: async (context) => {
		// Core members can view and manage the Projects timeline
		// (create/update/remove) alongside the board.
		await requireRole(context, [...BOARD_LEVEL, "core"]);
		return context.db.query("projects").collect();
	},
});

export const create = mutation({
	args: projectFields,
	handler: async (context, args) => {
		const person = await requireRole(context, [...BOARD_LEVEL, "core"]);
		assertLength(args.name, NAME_MAX, "Project name");
		assertLength(args.description, TEXT_MAX, "Description");
		assertDateOrder(args.startDate, args.endDate);
		const id = await context.db.insert("projects", {
			...args,
			createdBy: person._id,
		});
		await notifyNewProjectLeader(context, {
			projectId: id,
			projectName: args.name,
			prevLeaderId: undefined,
			nextLeaderId: args.leaderId,
			actorId: person._id,
		});
		return id;
	},
});

export const update = mutation({
	args: {
		id: v.id("projects"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		leaderId: v.optional(v.union(v.id("people"), v.null())),
		startDate: v.optional(v.union(v.number(), v.null())),
		endDate: v.optional(v.union(v.number(), v.null())),
	},
	handler: async (context, { id, ...patch }) => {
		const person = await requireRole(context, [...BOARD_LEVEL, "core"]);
		assertLength(patch.name, NAME_MAX, "Project name");
		assertLength(patch.description, TEXT_MAX, "Description");
		const clean: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(patch)) {
			clean[key] = value ?? undefined;
		}
		// Validate the resulting start/end ordering (a patch may set only one).
		const existing = await context.db.get(id);
		if (!existing) throw new Error("Project not found");
		const start = (
			"startDate" in clean ? clean.startDate : existing.startDate
		) as number | undefined;
		const end = ("endDate" in clean ? clean.endDate : existing.endDate) as
			| number
			| undefined;
		assertDateOrder(start, end);
		await context.db.patch(id, clean);
		if (patch.leaderId !== undefined) {
			await notifyNewProjectLeader(context, {
				projectId: id,
				projectName:
					(clean.name as string | undefined) ?? existing.name,
				prevLeaderId: existing.leaderId,
				nextLeaderId: clean.leaderId as Id<"people"> | undefined,
				actorId: person._id,
			});
		}
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("projects") },
	handler: async (context, { id }) => {
		await requireRole(context, [...BOARD_LEVEL, "core"]);
		// Detach tasks so no card points at a deleted project.
		const tasks = await context.db
			.query("tasks")
			.withIndex("by_project", (range) => range.eq("projectId", id))
			.collect();
		for (const task of tasks) {
			await context.db.patch(task._id, { projectId: undefined });
		}
		await context.db.delete(id);
		return null;
	},
});
