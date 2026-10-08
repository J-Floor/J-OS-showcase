import type { Id } from "../../../../convex/_generated/dataModel";

export const COLUMNS = [
	{ id: "backlog", label: "Backlog" },
	{ id: "in_progress", label: "In progress" },
	{ id: "done", label: "Done" },
] as const;

export type TaskStatus = (typeof COLUMNS)[number]["id"];

function isStatus(x: string): x is TaskStatus {
	return COLUMNS.some((c) => c.id === x);
}

/** Pure: maps a solid-dnd drop to a status mutation payload, or null to ignore. */
export function resolveDrop(
	draggableId: string,
	droppableId: string,
	tasks: readonly { _id: string; status: string }[]
): { id: Id<"tasks">; status: TaskStatus } | null {
	if (!isStatus(droppableId)) return null;
	const task = tasks.find((t) => t._id === draggableId);
	if (!task || task.status === droppableId) return null;
	return { id: draggableId as Id<"tasks">, status: droppableId };
}
