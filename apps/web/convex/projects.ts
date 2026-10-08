import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { assertLen, NAME_MAX, TEXT_MAX } from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";

const DATE_ORDER_ERROR = "Project start date must be on or before its end date";

function assertDateOrder(start?: number, end?: number): void {
	if (start != null && end != null && start > end) {
		throw new Error(DATE_ORDER_ERROR);
	}
}

// Notify a newly-assigned project lead (skipping the actor assigning
// themselves). `prevLeaderId` is undefined on create.
async function notifyNewProjectLeader(
	ctx: MutationCtx,
	projectId: Id<"projects">,
	projectName: string,
	prevLeaderId: Id<"people"> | undefined,
	nextLeaderId: Id<"people"> | undefined,
	actorId: Id<"people">
): Promise<void> {
	if (!nextLeaderId) return;
	if (nextLeaderId === prevLeaderId || nextLeaderId === actorId) return;
	await notify(ctx, "projectAssigned", {
		leaderId: nextLeaderId,
		projectId,
		projectName,
	});
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		// Core members can view and manage the Projects timeline
		// (create/update/remove) alongside the board.
		await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		return ctx.db.query("projects").collect();
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		leaderId: v.optional(v.id("people")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const person = await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		assertLen(args.name, NAME_MAX, "Project name");
		assertLen(args.description, TEXT_MAX, "Description");
		assertDateOrder(args.startDate, args.endDate);
		const id = await ctx.db.insert("projects", {
			...args,
			createdBy: person._id,
		});
		await notifyNewProjectLeader(
			ctx,
			id,
			args.name,
			undefined,
			args.leaderId,
			person._id
		);
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
	handler: async (ctx, { id, ...patch }) => {
		const person = await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		assertLen(patch.name, NAME_MAX, "Project name");
		assertLen(patch.description, TEXT_MAX, "Description");
		const clean: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(patch)) {
			clean[k] = val ?? undefined;
		}
		// Validate the resulting start/end ordering (a patch may set only one).
		const existing = await ctx.db.get(id);
		if (!existing) throw new Error("Project not found");
		const start = (
			"startDate" in clean ? clean.startDate : existing.startDate
		) as number | undefined;
		const end = ("endDate" in clean ? clean.endDate : existing.endDate) as
			| number
			| undefined;
		assertDateOrder(start, end);
		await ctx.db.patch(id, clean);
		if (patch.leaderId !== undefined) {
			await notifyNewProjectLeader(
				ctx,
				id,
				(clean.name as string | undefined) ?? existing.name,
				existing.leaderId,
				clean.leaderId as Id<"people"> | undefined,
				person._id
			);
		}
		return null;
	},
});

export const remove = mutation({
	args: { id: v.id("projects") },
	handler: async (ctx, { id }) => {
		await requireRole(ctx, [...BOARD_LEVEL, "core"]);
		// Detach tasks so no card points at a deleted project.
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_project", (q) => q.eq("projectId", id))
			.collect();
		for (const task of tasks) {
			await ctx.db.patch(task._id, { projectId: undefined });
		}
		await ctx.db.delete(id);
		return null;
	},
});
