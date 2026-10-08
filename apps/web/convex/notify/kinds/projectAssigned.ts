import { v } from "convex/values";

import { projectAssigned as projectAssignedEmail } from "../../emails/generated/projectAssigned.ts";
import {
	emailUrls,
	manageNotificationsUrl,
	projectUrl,
} from "../../emails/urls.ts";
import { entitledIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const projectAssigned = defineKind({
	category: "tasks",
	payload: v.object({
		leaderId: v.id("people"),
		projectId: v.id("projects"),
		projectName: v.string(),
	}),
	audience: (ctx, { leaderId }) => entitledIds(ctx, [leaderId]),
	push: ({ projectId, projectName }) => ({
		title: "You're leading a project",
		body: projectName,
		url: projectUrl(projectId),
		tag: `project-${projectId}`,
	}),
	email: ({ projectId, projectName }, recipient) => {
		const { html, text } = projectAssignedEmail({
			name: recipient.firstName,
			projectName,
			viewUrl: projectUrl(projectId),
			manageUrl: manageNotificationsUrl(),
			logoUrl: emailUrls().logoUrl,
		});
		return {
			subject: `You're leading a project: ${projectName}`,
			html,
			text,
		};
	},
});
