import type { Id } from "../../../../convex/_generated/dataModel";

export const COLUMNS = [
	{ id: "backlog", label: "Backlog" },
	{ id: "in_progress", label: "In progress" },
	{ id: "done", label: "Done" },
] as const;

export type TaskStatus = (typeof COLUMNS)[number]["id"];

function isStatus(value: string): value is TaskStatus {
	return COLUMNS.some((column) => column.id === value);
}

/** Pure: maps a solid-dnd drop to a status mutation payload, or null to ignore. */
export function resolveDrop(
	draggableId: string,
	droppableId: string,
	tasks: readonly { _id: string; status: string }[]
): { id: Id<"tasks">; status: TaskStatus } | null {
	if (!isStatus(droppableId)) return null;
	const task = tasks.find((candidate) => candidate._id === draggableId);
	return !task || task.status === droppableId
		? null
		: { id: draggableId as Id<"tasks">, status: droppableId };
}
