import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
} from "./_generated/server";
import { authorizeEdit, requireRole } from "./lib/authGuard.ts";
import type { InputError } from "./lib/errors/input.ts";
import { invariant, unwrap } from "./lib/result.ts";
import { CORE_AND_BOARD } from "./lib/roles.ts";
import { checkLength, NAME_MAX, TEXT_MAX } from "./lib/validate.ts";
import { notify } from "./notify/notify.ts";
import { projectFields } from "./schema.ts";

const BATCH_SIZE = 200;

function checkDateOrder(
	start?: number,
	end?: number
): Result<void, InputError> {
	return start !== undefined && end !== undefined && start > end
		? err({ type: "ProjectDatesOutOfOrder" })
		: ok();
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
		unwrap(await requireRole(context, CORE_AND_BOARD));
		return context.db.query("projects").collect();
	},
});

export const create = mutation({
	args: projectFields,
	handler: async (context, args) => {
		const person = unwrap(await requireRole(context, CORE_AND_BOARD));
		unwrap(checkLength(args.name, NAME_MAX));
		unwrap(checkLength(args.description, TEXT_MAX));
		unwrap(checkDateOrder(args.startDate, args.endDate));
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
		const { person, clean } = await authorizeEdit(context, patch, "name");
		// Validate the resulting start/end ordering (a patch may set only one).
		const existing = await context.db.get(id);
		invariant(existing, "Project not found");
		const start = (
			"startDate" in clean ? clean.startDate : existing.startDate
		) as number | undefined;
		const end = ("endDate" in clean ? clean.endDate : existing.endDate) as
			number | undefined;
		unwrap(checkDateOrder(start, end));
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
	handler: async (context, { id }): Promise<null> => {
		unwrap(await requireRole(context, CORE_AND_BOARD));
		// A second click or tab finds it gone and does nothing: the first
		// remove already queued the detach.
		const project = await context.db.get(id);
		if (project) {
			// The project goes first, so it leaves the list at once. Its tasks
			// are detached after, in bounded batches; until then a card's
			// projectId matches no project, which the tasks UI shows as none.
			await context.db.delete(id);
			await context.scheduler.runAfter(
				0,
				internal.projects.detachProjectTasks,
				{ projectId: id }
			);
		}
		return null;
	},
});

/**
 * Bounded batch detach of one project's tasks over the `by_project` index.
 * Reschedules itself while a batch comes back full. It converges because
 * clearing `projectId` takes each task out of the range it reads.
 */
export const detachProjectTasks = internalMutation({
	args: { projectId: v.id("projects") },
	handler: async (context, { projectId }): Promise<null> => {
		const tasks = await context.db
			.query("tasks")
			.withIndex("by_project", (range) =>
				range.eq("projectId", projectId)
			)
			.take(BATCH_SIZE);
		for (const task of tasks) {
			await context.db.patch(task._id, { projectId: undefined });
		}
		if (tasks.length === BATCH_SIZE) {
			await context.scheduler.runAfter(
				0,
				internal.projects.detachProjectTasks,
				{ projectId }
			);
		}
		return null;
	},
});
