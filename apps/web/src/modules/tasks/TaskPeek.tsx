import type { JSX } from "solid-js";

import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import type { Task } from "./data/tasksData.tsx";
import { TaskSheet } from "./sheets/TaskSheet.tsx";

/** The task sheet over any page. */
export function TaskPeek(props: PeekProps<Task>): JSX.Element {
	return (
		<TaskSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			task={props.row}
			loading={props.loading}
		/>
	);
}
