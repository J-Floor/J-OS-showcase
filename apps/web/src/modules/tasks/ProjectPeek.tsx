import type { JSX } from "solid-js";

import {
	slugOf,
	type PeekProps,
} from "../../shared/entity/entityDescriptor.ts";
import { useOpenEntity } from "../../shared/entity/openEntity.ts";

import type { Project } from "./data/tasksData.tsx";
import { taskEntity } from "./entity.ts";
import { ProjectSheet } from "./sheets/ProjectSheet.tsx";

/** The project sheet over any page; a task clicked in it opens as a peek. */
export function ProjectPeek(props: PeekProps<Project>): JSX.Element {
	const openEntity = useOpenEntity();
	return (
		<ProjectSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			project={props.row}
			loading={props.loading}
			onTaskClick={(task) => {
				openEntity(taskEntity, slugOf(taskEntity, task));
			}}
		/>
	);
}
