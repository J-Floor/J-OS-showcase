// jscpd:ignore-start -- an import block: import-x/order fixes its shape, and TaskSheet needs the same dependencies
import {
	Sheet,
	Input,
	PropertyRow,
	Query,
	createSaveTracker,
	type SaveTracker,
} from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import type { SheetNavState } from "../../../lib/createSheetNav.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { useBoardLevel } from "../../../shared/data/boardLevel.tsx";
import {
	createEntityCommands,
	createEntityDraft,
} from "../../../shared/entity/entityCommands.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";
import { dateToIso, isoToMs } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import {
	useProjectActions,
	useProjects,
	useTasks,
} from "../data/tasksData.tsx";
import { projectFields } from "../fields.ts";
import { TaskCard } from "../kanban/TaskCard.tsx";

import { DateField } from "./fields/DateField.tsx";
import { PersonSelect } from "./fields/PersonSelect.tsx";
import styles from "./ProjectSheet.module.scss";
// jscpd:ignore-end

// UTC-midnight ms for the local "today" — matches how dates are stored.
function todayMs(): number | undefined {
	return isoToMs(dateToIso(new Date()));
}

/**
 * Placeholder field layout shown by `Sheet.Skeleton` while
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
			<PropertyRow field={projectFields.leaderId}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={projectFields.startDate}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={projectFields.endDate}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type ProjectSheetProps = SheetOpenProps & {
	project?: Project;
	/** Create-mode date prefill (e.g. from dragging the timeline's "New" row). */
	initialStart?: number;
	initialEnd?: number;
	/** What a create sheet opens out of when nothing was just clicked (a
	 *  range dragged on the timeline). */
	morphFrom?: () => HTMLElement | null;
	/** What a click on one of the project's tasks does. */
	onTaskClick: (task: Task) => void;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `project` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/** The sheet's writes to its project, and the failure they report through.
 *  `onClose` closes the sheet after a create or a delete. */
function createProjectSheetCommands(
	props: ProjectSheetProps,
	onClose: () => void
) {
	return createEntityCommands({
		id: () => props.project?._id,
		actions: useProjectActions(),
		onClose,
	});
}

type ProjectSheetCommands = ReturnType<typeof createProjectSheetCommands>;

/**
 * Each field is a draft synced to its Convex value via createSyncedField (see
 * TaskSheet for the rationale). `key` includes `open` so the form re-seeds
 * each time the sheet opens; in create mode `remote` is the empty/initial
 * value (start defaults to today) and the `write`s no-op since `patch` guards
 * on `props.project`.
 */
function createProjectFields(
	props: ProjectSheetProps,
	patch: ProjectSheetCommands["patch"],
	tracker: SaveTracker
) {
	function key() {
		return `${String(props.open)}:${props.project?._id ?? "new"}`;
	}
	const sync = { key, open: () => props.open, tracker };

	return {
		name: createSyncedField({
			remote: () => props.project?.name ?? "",
			...sync,
			write: (value) => patch({ name: value }),
		}),
		leaderId: createSyncedField({
			remote: () => props.project?.leaderId,
			...sync,
			write: (value) => patch({ leaderId: value ?? null }),
			debounceMs: 0,
		}),
		startDate: createSyncedField({
			// Create mode: use the dragged-range prefill if given, else today. An
			// existing project's unset start must stay unset.
			remote: () =>
				props.project
					? props.project.startDate
					: (props.initialStart ?? todayMs()),
			...sync,
			write: (value) => patch({ startDate: value ?? null }),
			debounceMs: 0,
		}),
		endDate: createSyncedField({
			remote: () =>
				props.project ? props.project.endDate : props.initialEnd,
			...sync,
			write: (value) => patch({ endDate: value ?? null }),
			debounceMs: 0,
		}),
		description: createSyncedField({
			remote: () => props.project?.description ?? "",
			...sync,
			write: (value) => patch({ description: value }),
		}),
	};
}

type ProjectFields = ReturnType<typeof createProjectFields>;

/** Creating a project from the drafts, and deleting the open one. */
function createProjectCommands(
	props: ProjectSheetProps,
	fields: ProjectFields,
	commands: ProjectSheetCommands
) {
	async function createProject() {
		if (!fields.name.value().trim()) return;
		await commands.create({
			name: fields.name.value().trim(),
			leaderId: fields.leaderId.value(),
			startDate: fields.startDate.value(),
			endDate: fields.endDate.value(),
			description: fields.description.value().trim() || undefined,
		});
	}

	async function deleteProject() {
		await commands.remove(props.project?._id);
	}

	return { createProject, deleteProject };
}

/** Leader, then start and end dates kept ordered: pushing start past end
 *  drags end with it, pulling end before start drags start back. */
function ProjectDetailRows(props: { fields: ProjectFields; people: Person[] }) {
	return (
		<>
			<PropertyRow field={projectFields.leaderId}>
				<PersonSelect
					label={projectFields.leaderId.label}
					people={props.people}
					value={props.fields.leaderId.value()}
					placeholder="No leader"
					onChange={(id) => {
						props.fields.leaderId.set(id);
					}}
				/>
			</PropertyRow>

			<PropertyRow field={projectFields.startDate}>
				<DateField
					label={projectFields.startDate.label}
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

			<PropertyRow field={projectFields.endDate}>
				<DateField
					label={projectFields.endDate.label}
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

/** The tasks of `project` (none in create mode). */
function tasksOf(
	project: Project | undefined,
	tasks: Task[] | undefined
): Task[] | undefined {
	return project
		? tasks?.filter((task) => task.projectId === project._id)
		: [];
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

/** The sheet's fields, what they save, and the create form's draft
 *  guard. */
function createProjectSheet(props: ProjectSheetProps, isEdit: () => boolean) {
	const saves = createSaveTracker();
	const commands = createProjectSheetCommands(props, () => {
		draft.onOpenChange(false);
	});
	const fields = createProjectFields(props, commands.patch, saves);
	const draft = createEntityDraft(props, isEdit, fields, "new project");
	return {
		...createProjectCommands(props, fields, commands),
		failure: commands.failure,
		fields,
		saves,
		draft,
	};
}

export function ProjectSheet(props: ProjectSheetProps): JSX.Element {
	function isEdit() {
		return props.project !== undefined;
	}
	const { createProject, deleteProject, failure, fields, saves, draft } =
		createProjectSheet(props, isEdit);
	const boardLevel = useBoardLevel();
	const projects = useProjects();
	const tasks = useTasks();

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			{...draft.sheet}
			saveTracker={saves}
			morphId={props.project?._id}
			morphFrom={props.morphFrom}
		>
			<EntitySheetHeader.Root
				title={props.project?.name ?? "New project"}
				loading={props.loading}
				nav={props.nav}
				saveStatus={isEdit() && !props.loading}
			>
				<Show when={isEdit()}>
					<EntitySheetHeader.Delete
						label="Delete project"
						onDelete={() => void deleteProject()}
					/>
				</Show>
			</EntitySheetHeader.Root>
			<Sheet.Skeleton>
				<ProjectFieldsPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
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

				<ProjectDetailRows
					fields={fields}
					people={boardLevel.data() ?? []}
				/>

				<DescriptionField
					class={styles.description}
					description={fields.description}
					maxLength={TEXT_MAX}
				/>
				<InlineError message={failure.error()} />

				<Show when={isEdit()}>
					<ProjectTasksSection
						tasks={tasksOf(props.project, tasks.data())}
						people={boardLevel.data() ?? []}
						projects={projects.data() ?? []}
						onTaskClick={props.onTaskClick}
					/>
				</Show>
			</Sheet.Body>
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
		</Sheet.Root>
	);
}
