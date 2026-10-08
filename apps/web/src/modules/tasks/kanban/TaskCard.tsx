import { Icon } from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { ICONS } from "../../../shared/icons.ts";
import { assigneeNames, formatDate, projectName } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";

import styles from "./TaskCard.module.scss";

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
	// drag ends, which would otherwise open the drawer. Ignore clicks where the
	// pointer moved more than a few px between down and up.
	let downX = 0;
	let downY = 0;
	function onPointerDown(e: PointerEvent) {
		downX = e.clientX;
		downY = e.clientY;
	}
	function onClick(e: MouseEvent) {
		if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
		props.onClick();
	}

	return (
		<article
			classList={{ [styles.card]: true, [styles.pointer]: props.pointer }}
			onPointerDown={onPointerDown}
			onClick={onClick}
		>
			<h4 class={styles.title}>{props.task.title}</h4>
			<div class={styles.meta}>
				<Show when={!props.hideProject && project()}>
					<span class={styles.project}>
						<Icon>{ICONS.project}</Icon>
						{project()}
					</span>
				</Show>
				<Show when={names().length}>
					<span class={styles.assignees}>
						<Icon>{ICONS.assignees}</Icon>
						<span>
							<For each={names()}>
								{(n) => (
									<>
										<span>{n}</span>
										<Show
											when={
												names().indexOf(n) !==
												names().length - 1
											}
										>
											,{" "}
										</Show>
									</>
								)}
							</For>
						</span>
					</span>
				</Show>
				<Show when={due()}>
					<span class={styles.due}>
						<Icon>{ICONS.date}</Icon>
						{due()}
					</span>
				</Show>
			</div>
		</article>
	);
}
