import { v } from "convex/values";

import { taskUrl } from "../../emails/urls.ts";
import { entitledIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const taskAssigned = defineKind({
	category: "tasks",
	delivery: "digest",
	payload: v.object({
		assigneeId: v.id("people"),
		taskId: v.id("tasks"),
		taskTitle: v.string(),
	}),
	audience: (context, { assigneeId }) => entitledIds(context, [assigneeId]),
	push: ({ taskId, taskTitle }) => ({
		title: "New task assigned",
		body: taskTitle,
		url: taskUrl(taskId),
		tag: `task-${taskId}`,
	}),
});
