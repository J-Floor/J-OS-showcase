import { Sheet, Input, PropertyRow, Select } from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import { celebrate } from "../../../lib/celebrate.ts";
import {
	createSyncedField,
	shallowArrayEquals,
} from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import {
	createActionError,
	scopeOfFields,
	type ActionErrorState,
} from "../../../shared/createActionError.ts";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntitySheetHeader,
	type SheetNavState,
} from "../../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useTaskActions, type TaskActions } from "../data/tasksData.tsx";
import { taskFields } from "../fields.ts";

import { AssigneeSelect } from "./fields/AssigneeSelect.tsx";
import { DateField } from "./fields/DateField.tsx";
import { ProjectSelect } from "./fields/ProjectSelect.tsx";
import styles from "./TaskSheet.module.scss";

const STATUS_OPTIONS = [
	{ value: "backlog", label: "Backlog" },
	{ value: "in_progress", label: "In progress" },
	{ value: "done", label: "Done" },
];

/**
 * Placeholder field layout shown by `Sheet.Skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded field list (mirrors `EventFieldsPlaceholder`); literal
 * "placeholder" text, never real or create-form copy.
 */
function TaskFieldsPlaceholder() {
	return (
		<>
			<PropertyRow icon={ICONS.name} label="Title">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={taskFields.status}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={taskFields.assigneeIds}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={taskFields.projectId}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow field={taskFields.dueDate}>
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type TaskSheetProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	task?: Task;
	/** Status the form starts with in create mode (e.g. a column's "+" prefills it). */
	initialStatus?: Task["status"];
	people: Person[];
	projects: Project[];
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `task` (which is undefined in both states). */
	loading?: boolean;
	nav?: SheetNavState;
};

/**
 * Each field is a draft synced to its Convex value via createSyncedField: the
 * local draft drives the input (no echo race on fast typing), edits push to
 * Convex (debounced for free text, immediately for discrete controls), and
 * remote changes are adopted while the field is idle. `key` includes `open`
 * so the form re-seeds every time the sheet opens — in create mode `remote`
 * is the empty/initial value, so it resets; the `write`s no-op (patch guards
 * on `props.task`) and createTask reads the drafts directly.
 */
function createTaskFields(
	props: TaskSheetProps,
	actions: TaskActions,
	failure: ActionErrorState
) {
	function key() {
		return `${String(props.open)}:${props.task?._id ?? "new"}`;
	}

	// Simplified patch: the server validator constrains the real payload.
	async function patchTask(task: Task, fields: Record<string, unknown>) {
		await failure.trackResult(
			actions.update({ id: task._id, ...fields }),
			scopeOfFields(fields)
		);
	}

	function patch(fields: Record<string, unknown>) {
		if (props.task) void patchTask(props.task, fields);
	}

	return {
		title: createSyncedField({
			remote: () => props.task?.title ?? "",
			key,
			write: (value) => {
				patch({ title: value });
			},
		}),
		status: createSyncedField<Task["status"]>({
			remote: () =>
				props.task?.status ?? props.initialStatus ?? "backlog",
			key,
			write: (value) => {
				patch({ status: value });
			},
			debounceMs: 0,
		}),
		assignees: createSyncedField({
			remote: () => props.task?.assigneeIds ?? [],
			key,
			write: (value) => {
				patch({ assigneeIds: value });
			},
			debounceMs: 0,
			equals: shallowArrayEquals,
		}),
		projectId: createSyncedField({
			remote: () => props.task?.projectId,
			key,
			write: (value) => {
				patch({ projectId: value ?? null });
			},
			debounceMs: 0,
		}),
		dueDate: createSyncedField({
			remote: () => props.task?.dueDate,
			key,
			write: (value) => {
				patch({ dueDate: value ?? null });
			},
			debounceMs: 0,
		}),
		description: createSyncedField({
			remote: () => props.task?.description ?? "",
			key,
			write: (value) => {
				patch({ description: value });
			},
		}),
	};
}

type TaskFields = ReturnType<typeof createTaskFields>;

/** The status picker. Completing a task bursts confetti from its row — set
 *  first, since the status write must never depend on the decorative
 *  confetti, which can fail. */
function StatusRow(props: { status: TaskFields["status"] }) {
	// Anchors the completion confetti to the Status row.
	let statusRowElement: HTMLDivElement | undefined;
	return (
		<PropertyRow
			field={taskFields.status}
			ref={(element) => {
				statusRowElement = element;
			}}
		>
			<Select.Root
				label={taskFields.status.label}
				labelHidden
				value={[props.status.value()]}
				positioning={{ sameWidth: true }}
				onValueChange={(details) => {
					const next = details.value[0] as Task["status"];
					const isCompleted =
						next === "done" && props.status.value() !== "done";
					// Set first — the status write must never depend on the
					// decorative confetti, which can fail.
					props.status.set(next);
					if (isCompleted) {
						// Decorative only: a failure is ignored.
						celebrate(statusRowElement);
					}
				}}
			>
				<For each={STATUS_OPTIONS}>
					{(option) => (
						<Select.Option value={option.value}>
							{option.label}
						</Select.Option>
					)}
				</For>
			</Select.Root>
		</PropertyRow>
	);
}

/** Assignees, project and due date. */
function TaskDetailRows(props: {
	fields: TaskFields;
	people: Person[];
	projects: Project[];
}) {
	return (
		<>
			<PropertyRow field={taskFields.assigneeIds}>
				<AssigneeSelect
					label={taskFields.assigneeIds.label}
					people={props.people}
					value={props.fields.assignees.value()}
					onChange={(ids) => {
						props.fields.assignees.set(ids);
					}}
				/>
			</PropertyRow>

			<PropertyRow field={taskFields.projectId}>
				<ProjectSelect
					label={taskFields.projectId.label}
					projects={props.projects}
					value={props.fields.projectId.value()}
					onChange={(id) => {
						props.fields.projectId.set(id);
					}}
				/>
			</PropertyRow>

			<PropertyRow field={taskFields.dueDate}>
				<DateField
					label={taskFields.dueDate.label}
					value={props.fields.dueDate.value()}
					onChange={(ms) => {
						props.fields.dueDate.set(ms);
					}}
				/>
			</PropertyRow>
		</>
	);
}

/** Creating a task from the drafts, and deleting the open one. */
function createTaskCommands(
	props: TaskSheetProps,
	fields: TaskFields,
	actions: TaskActions,
	failure: ActionErrorState
) {
	async function createTask() {
		if (!fields.title.value().trim()) return;
		const result = await failure.trackResult(
			actions.create({
				title: fields.title.value().trim(),
				status: fields.status.value(),
				assigneeIds: fields.assignees.value(),
				projectId: fields.projectId.value(),
				dueDate: fields.dueDate.value(),
				description: fields.description.value().trim() || undefined,
			})
		);
		if (result.isErr()) return;
		props.onOpenChange(false);
	}

	async function deleteTask() {
		if (!props.task) {
			props.onOpenChange(false);
			return;
		}
		const result = await failure.trackResult(
			actions.remove(props.task._id)
		);
		if (result.isErr()) return;
		props.onOpenChange(false);
	}

	return { createTask, deleteTask };
}

export function TaskSheet(props: TaskSheetProps): JSX.Element {
	const actions = useTaskActions();
	const failure = createActionError();
	const fields = createTaskFields(props, actions, failure);
	const { createTask, deleteTask } = createTaskCommands(
		props,
		fields,
		actions,
		failure
	);
	function isEdit() {
		return props.task !== undefined;
	}

	// Focused when the sheet opens.
	let titleElement: HTMLInputElement | undefined;

	return (
		<Sheet.Root
			open={props.open}
			morph={props.task?._id}
			onOpenChange={props.onOpenChange}
			initialFocusEl={() => titleElement ?? null}
		>
			<EntitySheetHeader
				title={props.task?.title ?? "New task"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete task"
				onDelete={() => {
					void deleteTask();
				}}
			/>
			<Sheet.Skeleton>
				<TaskFieldsPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
				<Input
					label="Title"
					maxLength={NAME_MAX}
					required
					ref={(element: HTMLInputElement) => {
						titleElement = element;
					}}
					class={styles.titleInput}
					placeholder="Task title"
					value={fields.title.value()}
					onInput={(event) => {
						fields.title.set(event.currentTarget.value);
					}}
					onBlur={fields.title.flush}
				/>
				<StatusRow status={fields.status} />
				<TaskDetailRows
					fields={fields}
					people={props.people}
					projects={props.projects}
				/>
				<DescriptionField
					class={styles.description}
					description={fields.description}
					maxLength={TEXT_MAX}
				/>
				<InlineError message={failure.error()} />
			</Sheet.Body>
			<Show when={!props.loading && !isEdit()}>
				<EntityCreateFooter
					label="Create task"
					disabledReason="Add a title first"
					canCreate={fields.title.value().trim() !== ""}
					onCreate={() => {
						void createTask();
					}}
				/>
			</Show>
		</Sheet.Root>
	);
}
