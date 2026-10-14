import {
	Drawer,
	Input,
	PropertyRow,
	Select,
	fireConfetti,
} from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import {
	createSyncedField,
	shallowArrayEquals,
} from "../../../lib/createSyncedField.ts";
import { DescriptionField } from "../../../shared/components/DescriptionField.tsx";
import { SelectOptionList } from "../../../shared/components/SelectOptionList.tsx";
import { EntityCreateFooter } from "../../../shared/entity/EntityCreateFooter.tsx";
import {
	EntityDrawerHeader,
	type DrawerNavState,
} from "../../../shared/entity/EntityDrawerHeader.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useTaskActions, type TaskActions } from "../data/tasksData.tsx";

import { AssigneeSelect } from "./fields/AssigneeSelect.tsx";
import { DateField } from "./fields/DateField.tsx";
import { ProjectSelect } from "./fields/ProjectSelect.tsx";
import styles from "./TaskDrawer.module.scss";

const STATUS_OPTIONS = [
	{ value: "backlog", title: "Backlog" },
	{ value: "in_progress", title: "In progress" },
	{ value: "done", title: "Done" },
];

/**
 * Placeholder field layout passed to `Drawer.Body`'s `skeleton` while
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
			<PropertyRow icon={ICONS.status} label="Status">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.assignees} label="Assignees">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.project} label="Project">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.date} label="Due date">
				<span>placeholder</span>
			</PropertyRow>
			<PropertyRow icon={ICONS.description} label="Description">
				<span>placeholder</span>
			</PropertyRow>
		</>
	);
}

type TaskDrawerProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	task?: Task;
	/** Status the form starts with in create mode (e.g. a column's "+" prefills it). */
	initialStatus?: Task["status"];
	people: Person[];
	projects: Project[];
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `task` (which is undefined in both states). */
	loading?: boolean;
	nav?: DrawerNavState;
};

/**
 * Each field is a draft synced to its Convex value via createSyncedField: the
 * local draft drives the input (no echo race on fast typing), edits push to
 * Convex (debounced for free text, immediately for discrete controls), and
 * remote changes are adopted while the field is idle. `key` includes `open`
 * so the form re-seeds every time the drawer opens — in create mode `remote`
 * is the empty/initial value, so it resets; the `write`s no-op (patch guards
 * on `props.task`) and createTask reads the drafts directly.
 */
function createTaskFields(props: TaskDrawerProps, actions: TaskActions) {
	function key() {
		return `${String(props.open)}:${props.task?._id ?? "new"}`;
	}

	// Simplified patch: the server validator constrains the real payload.
	function patch(fields: Record<string, unknown>) {
		if (props.task) void actions.update({ id: props.task._id, ...fields });
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
 *  confetti, which can throw. */
function StatusRow(props: { status: TaskFields["status"] }) {
	// Anchors the completion confetti to the Status row.
	let statusRowElement: HTMLDivElement | undefined;
	return (
		<PropertyRow
			icon={ICONS.status}
			label="Status"
			ref={(element) => {
				statusRowElement = element;
			}}
		>
			<Select.Root
				options={STATUS_OPTIONS}
				value={[props.status.value()]}
				sameWidth
				onValueChange={(details) => {
					const next = details.value[0] as Task["status"];
					const isCompleted =
						next === "done" && props.status.value() !== "done";
					// Set first — the status write must never depend on the
					// decorative confetti, which can throw.
					props.status.set(next);
					if (isCompleted) {
						try {
							fireConfetti(statusRowElement);
						} catch {
							/* decorative only */
						}
					}
				}}
			>
				<SelectOptionList options={STATUS_OPTIONS} />
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
			<PropertyRow icon={ICONS.assignees} label="Assignees">
				<AssigneeSelect
					people={props.people}
					value={props.fields.assignees.value()}
					onChange={(ids) => {
						props.fields.assignees.set(ids);
					}}
				/>
			</PropertyRow>

			<PropertyRow icon={ICONS.project} label="Project">
				<ProjectSelect
					projects={props.projects}
					value={props.fields.projectId.value()}
					onChange={(id) => {
						props.fields.projectId.set(id);
					}}
				/>
			</PropertyRow>

			<PropertyRow icon={ICONS.date} label="Due date">
				<DateField
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
	props: TaskDrawerProps,
	fields: TaskFields,
	actions: TaskActions
) {
	async function createTask() {
		if (!fields.title.value().trim()) return;
		await actions.create({
			title: fields.title.value().trim(),
			status: fields.status.value(),
			assigneeIds: fields.assignees.value(),
			projectId: fields.projectId.value(),
			dueDate: fields.dueDate.value(),
			description: fields.description.value().trim() || undefined,
		});
		props.onOpenChange(false);
	}

	function deleteTask() {
		if (props.task) void actions.remove(props.task._id);
		props.onOpenChange(false);
	}

	return { createTask, deleteTask };
}

export function TaskDrawer(props: TaskDrawerProps): JSX.Element {
	const actions = useTaskActions();
	const fields = createTaskFields(props, actions);
	const { createTask, deleteTask } = createTaskCommands(
		props,
		fields,
		actions
	);
	function isEdit() {
		return props.task !== undefined;
	}

	// Focused when the drawer opens.
	let titleElement: HTMLInputElement | undefined;

	return (
		<Drawer.Root
			open={props.open}
			onOpenChange={props.onOpenChange}
			initialFocusEl={() => titleElement ?? null}
		>
			<EntityDrawerHeader
				title={isEdit() ? "Task" : "New task"}
				loading={props.loading}
				nav={props.nav}
				isEdit={isEdit()}
				deleteLabel="Delete task"
				onDelete={deleteTask}
			/>
			<Drawer.Body
				loading={props.loading}
				skeleton={<TaskFieldsPlaceholder />}
			>
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
			</Drawer.Body>
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
		</Drawer.Root>
	);
}
