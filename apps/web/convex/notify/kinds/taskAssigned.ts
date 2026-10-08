import { v } from "convex/values";

import { taskAssigned as taskAssignedEmail } from "../../emails/generated/taskAssigned.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	taskUrl,
} from "../../emails/urls.ts";
import { entitledIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const taskAssigned = defineKind({
	category: "tasks",
	payload: v.object({
		assigneeId: v.id("people"),
		taskId: v.id("tasks"),
		taskTitle: v.string(),
	}),
	audience: (ctx, { assigneeId }) => entitledIds(ctx, [assigneeId]),
	push: ({ taskId, taskTitle }) => ({
		title: "New task assigned",
		body: taskTitle,
		url: taskUrl(taskId),
		tag: `task-${taskId}`,
	}),
	email: ({ taskId, taskTitle }, recipient) => {
		const { html, text } = taskAssignedEmail({
			name: recipient.firstName,
			taskTitle,
			viewUrl: taskUrl(taskId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: `You've been assigned a task: ${taskTitle}`,
			html,
			text,
		};
	},
});
