import { useQuery } from "convex-solidjs";
import type { Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { ICONS } from "../../shared/icons.ts";

/** `useRows` factory for the task descriptor — wraps `tasks.list`. Must be
 *  called inside a component (never at module scope). */
function useTaskRows(): Accessor<Doc<"tasks">[] | undefined> {
	const tasks = useQuery(api.tasks.list, {}, { keepPreviousData: true });
	return tasks.data;
}

/** `useRows` factory for the project descriptor — wraps `projects.list`. Must
 *  be called inside a component (never at module scope). */
function useProjectRows(): Accessor<Doc<"projects">[] | undefined> {
	const projects = useQuery(
		api.projects.list,
		{},
		{ keepPreviousData: true }
	);
	return projects.data;
}

/** Task entity descriptor: board/core-visible kanban row, linking into the
 *  Tasks tab (`?task=<id>`). */
export const taskEntity: EntityDescriptor<Doc<"tasks">> = {
	key: "task",
	route: "/tasks",
	param: "task",
	group: "Tasks",
	icon: ICONS.task,
	useRows: useTaskRows,
	label: (row) => row.title,
	detail: (row) => row.status,
	ability: { action: "view", subject: "Tasks" },
};

/** Project entity descriptor: board/core-visible timeline row, linking into
 *  the Projects tab (`?project=<id>`). */
export const projectEntity: EntityDescriptor<Doc<"projects">> = {
	key: "project",
	route: "/tasks",
	param: "project",
	group: "Projects",
	icon: ICONS.project,
	useRows: useProjectRows,
	label: (row) => row.name,
	ability: { action: "view", subject: "Tasks" },
};
