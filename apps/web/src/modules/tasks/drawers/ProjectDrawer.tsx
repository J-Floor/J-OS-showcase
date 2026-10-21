import { Drawer, Input, PropertyRow, Query } from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import {
	createActionError,
	scopeOfFields,
	type ActionErrorState,
} from "../../../shared/createActionError.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntityDrawerHeader,
	type DrawerNavState,
} from "../../../shared/entity/EntityDrawerHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { dateToIso, isoToMs } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useProjectActions, type ProjectActions } from "../data/tasksData.tsx";
import { TaskCard } from "../kanban/TaskCard.tsx";

import { DateField } from "./fields/DateField.tsx";
import { PersonSelect } from "./fields/PersonSelect.tsx";
import styles from "./ProjectDrawer.module.scss";

// UTC-midnight ms for the local "today" — matches how dates are stored.
function todayMs(): number | undefined {
	return isoToMs(dateToIso(new Date()));
}

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded field list (mirrors `EventFieldsPlaceholder`); literal
 * "placeholder" text, never real or create-form copy.
 */
function ProjectFieldsPlaceholder() {
	return (
		<>
			<PropertyRow icon={ICONS.name} label="Name">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.person} label="Leader">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.start} label="Start">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.end} label="End">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type ProjectDrawerProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	project?: Project;
	/** Create-mode date prefill (e.g. from dragging the timeline's "New" row). */
	initialStart?: number;
	initialEnd?: number;
	people: Person[];
	projects: Project[];
	tasks: Task[] | undefined;
	onTaskClick: (task: Task) => void;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `project` (which is undefined in both states). */
	loading?: boolean;
	nav?: DrawerNavState;
};

/**
 * Each field is a draft synced to its Convex value via createSyncedField (see
 * TaskDrawer for the rationale). `key` includes `open` so the form re-seeds
 * each time the drawer opens; in create mode `remote` is the empty/initial
 * value (start defaults to today) and the `write`s no-op since `patch` guards
 * on `props.project`.
 */
function createProjectFields(
	props: ProjectDrawerProps,
	actions: ProjectActions,
	failure: ActionErrorState
) {
	function key() {
		return `${String(props.open)}:${props.project?._id ?? "new"}`;
	}

	async function patchProject(
		project: Project,
		fields: Record<string, unknown>
	) {
		await failure.trackResult(
			actions.update({ id: project._id, ...fields }),
			scopeOfFields(fields)
		);
	}

	function patch(fields: Record<string, unknown>) {
		if (props.project) void patchProject(props.project, fields);
	}

	return {
		name: createSyncedField({
			remote: () => props.project?.name ?? "",
			key,
			write: (value) => {
				patch({ name: value });
			},
		}),
		leaderId: createSyncedField({
			remote: () => props.project?.leaderId,
			key,
			write: (value) => {
				patch({ leaderId: value ?? null });
			},
			debounceMs: 0,
		}),
		startDate: createSyncedField({
			// Create mode: use the dragged-range prefill if given, else today. An
			// existing project's unset start must stay unset.
			remote: () =>
				props.project
					? props.project.startDate
					: (props.initialStart ?? todayMs()),
			key,
			write: (value) => {
				patch({ startDate: value ?? null });
			},
			debounceMs: 0,
		}),
		endDate: createSyncedField({
			remote: () =>
				props.project ? props.project.endDate : props.initialEnd,
			key,
			write: (value) => {
				patch({ endDate: value ?? null });
			},
			debounceMs: 0,
		}),
		description: createSyncedField({
			remote: () => props.project?.description ?? "",
			key,
			write: (value) => {
				patch({ description: value });
			},
		}),
	};
}

type ProjectFields = ReturnType<typeof createProjectFields>;

/** Creating a project from the drafts, and deleting the open one. */
function createProjectCommands(
	props: ProjectDrawerProps,
	fields: ProjectFields,
	actions: ProjectActions,
	failure: ActionErrorState
) {
	async function createProject() {
		if (!fields.name.value().trim()) return;
		const result = await failure.trackResult(
			actions.create({
				name: fields.name.value().trim(),
				leaderId: fields.leaderId.value(),
				startDate: fields.startDate.value(),
				endDate: fields.endDate.value(),
				description: fields.description.value().trim() || undefined,
			})
		);
		if (result.isErr()) return;
		props.onOpenChange(false);
	}

	async function deleteProject() {
		if (!props.project) {
			props.onOpenChange(false);
			return;
		}
		const result = await failure.trackResult(
			actions.remove(props.project._id)
		);
		if (result.isErr()) return;
		props.onOpenChange(false);
	}

	return { createProject, deleteProject };
}

/** Leader, then start and end dates kept ordered: pushing start past end
 *  drags end with it, pulling end before start drags start back. */
function ProjectDetailRows(props: { fields: ProjectFields; people: Person[] }) {
	return (
		<>
			<PropertyRow icon={ICONS.person} label="Leader">
				<PersonSelect
					people={props.people}
					value={props.fields.leaderId.value()}
					placeholder="No leader"
					onChange={(id) => {
						props.fields.leaderId.set(id);
					}}
				/>
			</PropertyRow>

			<PropertyRow icon={ICONS.start} label="Start">
				<DateField
					value={props.fields.startDate.value()}
					onChange={(ms) => {
						props.fields.startDate.set(ms);
						// Keep start ≤ end: pushing start past end drags end with it.
						const end = props.fields.endDate.value();
						if (ms !== undefined && end !== undefined && ms > end)
							props.fields.endDate.set(ms);
					}}
				/>
			</PropertyRow>

			<PropertyRow icon={ICONS.end} label="End">
				<DateField
					value={props.fields.endDate.value()}
					onChange={(ms) => {
						props.fields.endDate.set(ms);
						// Keep start ≤ end: pulling end before start drags start back.
						const start = props.fields.startDate.value();
						if (
							ms !== undefined &&
							start !== undefined &&
							ms < start
						)
							props.fields.startDate.set(ms);
					}}
				/>
			</PropertyRow>
		</>
	);
}

/** The project's tasks, as cards that open the task. */
function ProjectTasksSection(props: {
	tasks: Task[] | undefined;
	people: Person[];
	projects: Project[];
	onTaskClick: (task: Task) => void;
}) {
	return (
		<section class={styles.tasks}>
			<h4>Tasks</h4>
			<Query.Root data={props.tasks}>
				<Query.Empty>
					<p class={styles.empty}>No tasks yet.</p>
				</Query.Empty>
				<Query.Content of={props.tasks}>
					{(rows) => (
						<ul>
							<For each={rows()}>
								{(task) => (
									<li>
										<TaskCard
											task={task}
											people={props.people}
											projects={props.projects}
											hideProject
											pointer
											onClick={() => {
												props.onTaskClick(task);
											}}
										/>
									</li>
								)}
							</For>
						</ul>
					)}
				</Query.Content>
			</Query.Root>
		</section>
	);
}

export function ProjectDrawer(props: ProjectDrawerProps): JSX.Element {
	const actions = useProjectActions();
	const failure = createActionError();
	const fields = createProjectFields(props, actions, failure);
	const { createProject, deleteProject } = createProjectCommands(
		props,
		fields,
		actions,
		failure
	);
	function isEdit() {
		return props.project !== undefined;
	}

	function projectTasks() {
		const project = props.project;
		return project
			? props.tasks?.filter((task) => task.projectId === project._id)
			: [];
	}

	return (
		<Drawer.Root open={props.open} onOpenChange={props.onOpenChange}>
			<EntityDrawerHeader
				title={isEdit() ? "Project" : "New project"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete project"
				onDelete={() => {
					void deleteProject();
				}}
			/>
			<Drawer.Body
				loading={props.loading}
				skeleton={<ProjectFieldsPlaceholder />}
			>
				<Input
					label="Name"
					maxLength={NAME_MAX}
					required
					class={styles.nameInput}
					placeholder="Project name"
					value={fields.name.value()}
					onInput={(event) => {
						fields.name.set(event.currentTarget.value);
					}}
					onBlur={fields.name.flush}
				/>

				<ProjectDetailRows fields={fields} people={props.people} />

				<DescriptionField
					class={styles.description}
					description={fields.description}
					maxLength={TEXT_MAX}
				/>
				<InlineError message={failure.error()} />

				<Show when={isEdit()}>
					<ProjectTasksSection
						tasks={projectTasks()}
						people={props.people}
						projects={props.projects}
						onTaskClick={props.onTaskClick}
					/>
				</Show>
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<EntityCreateFooter
					label="Create project"
					disabledReason="Add a name first"
					canCreate={fields.name.value().trim() !== ""}
					onCreate={() => {
						void createProject();
					}}
				/>
			</Show>
		</Drawer.Root>
	);
}
