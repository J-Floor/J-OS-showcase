import type { Id } from "../../../../convex/_generated/dataModel";
import type { Task } from "../data/tasksData.tsx";

export type TaskStatus = Task["status"];

/** The statuses in board order, with the label each lane and picker shows. */
export const TASK_STATUSES = [
	{ id: "backlog", label: "Backlog" },
	{ id: "in_progress", label: "In progress" },
	{ id: "done", label: "Done" },
] as const satisfies readonly { id: TaskStatus; label: string }[];

function isStatus(value: string): value is TaskStatus {
	return TASK_STATUSES.some((status) => status.id === value);
}

/** Pure: maps a solid-dnd drop to a status mutation payload, or null to ignore. */
export function resolveDrop(
	draggableId: string,
	droppableId: string,
	tasks: readonly Pick<Task, "_id" | "status">[]
): { id: Id<"tasks">; status: TaskStatus } | null {
	if (!isStatus(droppableId)) return null;
	const task = tasks.find((candidate) => candidate._id === draggableId);
	return !task || task.status === droppableId
		? null
		: { id: task._id, status: droppableId };
}
