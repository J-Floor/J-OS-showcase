import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** A task's fields, shared by its card and its sheet so they fly together. */
export const taskFields = defineFields({
	status: { label: "Status", icon: ICONS.status },
	assigneeIds: { label: "Assignees", icon: ICONS.assignees },
	projectId: { label: "Project", icon: ICONS.project },
	dueDate: { label: "Due date", icon: ICONS.date },
});

/** A project's fields, shared by its card and its sheet. */
export const projectFields = defineFields({
	leaderId: { label: "Leader", icon: ICONS.person },
	startDate: { label: "Start", icon: ICONS.start },
	endDate: { label: "End", icon: ICONS.end },
});
