import { Icon, Morph, morphPart, morphTitle } from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { ICONS } from "../../../shared/icons.ts";
import { assigneeNames, formatDate, projectName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { taskFields } from "../fields.ts";

import styles from "./TaskCard.module.scss";

const CLICK_SLOP_PX = 5;

function Assignees(props: { names: string[] }): JSX.Element {
	return (
		<span class={styles.assignees} {...morphPart(taskFields.assigneeIds)}>
			<Icon>{ICONS.assignees}</Icon>
			<span>
				<For each={props.names}>
					{(name, index) => (
						<>
							<span>{name}</span>
							<Show when={index() !== props.names.length - 1}>
								,{" "}
							</Show>
						</>
					)}
				</For>
			</span>
		</span>
	);
}

export function TaskCard(props: {
	task: Task;
	people: Person[];
	projects: Project[];
	/** Hide the project chip (e.g. inside a project's own task list). */
	hideProject?: boolean;
	/** Use a pointer cursor instead of the kanban grab (non-draggable contexts). */
	pointer?: boolean;
	onClick: () => void;
}): JSX.Element {
	function names() {
		return assigneeNames(props.task.assigneeIds, props.people);
	}
	function project() {
		return projectName(props.task.projectId, props.projects);
	}
	function due() {
		return formatDate(props.task.dueDate);
	}

	// Distinguish a click from a drag: solid-dnd fires a native click after a
	// drag ends, which would otherwise open the sheet. Ignore clicks where the
	// pointer moved more than a few px between down and up.
	let downX = 0;
	let downY = 0;
	function onPointerDown(event: PointerEvent) {
		downX = event.clientX;
		downY = event.clientY;
	}
	function onClick(event: MouseEvent) {
		if (
			Math.hypot(event.clientX - downX, event.clientY - downY) >
			CLICK_SLOP_PX
		)
			return;
		props.onClick();
	}

	return (
		<Morph
			of={props.task._id}
			asChild={(morph) => (
				<article
					{...morph()}
					classList={{
						[styles.card]: true,
						[styles.pointer]: props.pointer,
					}}
					onPointerDown={onPointerDown}
					onClick={onClick}
				>
					<h4 class={styles.title} {...morphTitle}>
						{props.task.title}
					</h4>
					<div class={styles.meta}>
						<Show when={names().length}>
							<Assignees names={names()} />
						</Show>
						<Show when={!props.hideProject && project()}>
							<span
								class={styles.project}
								{...morphPart(taskFields.projectId)}
							>
								<Icon>{ICONS.project}</Icon>
								{project()}
							</span>
						</Show>
						<Show when={due()}>
							<span
								class={styles.due}
								{...morphPart(taskFields.dueDate)}
							>
								<Icon>{ICONS.date}</Icon>
								{due()}
							</span>
						</Show>
					</div>
				</article>
			)}
		/>
	);
}
