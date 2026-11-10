import { v } from "convex/values";

import { projectUrl } from "../../emails/urls.ts";
import { entitledIds } from "../audience.ts";
import { defineKind } from "../types.ts";

export const projectAssigned = defineKind({
	category: "tasks",
	delivery: "digest",
	payload: v.object({
		leaderId: v.id("people"),
		projectId: v.id("projects"),
		projectName: v.string(),
	}),
	audience: (context, { leaderId }) => entitledIds(context, [leaderId]),
	push: ({ projectId, projectName }) => ({
		title: "You're leading a project",
		body: projectName,
		url: projectUrl(projectId),
		tag: `project-${projectId}`,
	}),
});
