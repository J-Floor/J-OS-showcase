import {
	Button,
	Drawer,
	DrawerNav,
	IconButton,
	Input,
	PropertyRow,
	Select,
	TextArea,
	fireConfetti,
} from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import {
	createSyncedField,
	shallowArrayEquals,
} from "../../../lib/createSyncedField.ts";
import { ICONS } from "../../../shared/icons.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useTaskActions } from "../data/tasksData.tsx";

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

export function TaskDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	task?: Task;
	/** Status the form starts with in create mode (e.g. a column's "+" prefills it). */
	initialStatus?: Task["status"];
	people: Person[];
	projects: Project[];
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `task` (which is undefined in both states). */
	loading?: boolean;
	nav?: {
		hasPrev: () => boolean;
		hasNext: () => boolean;
		onPrev: () => void;
		onNext: () => void;
	};
}): JSX.Element {
	const actions = useTaskActions();
	function isEdit() {
		return props.task !== undefined;
	}

	// Focused when the drawer opens.
	let titleEl: HTMLInputElement | undefined;
	// Anchors the completion confetti to the Status row.
	let statusRowEl: HTMLDivElement | undefined;

	// Each field is a draft synced to its Convex value via createSyncedField: the
	// local draft drives the input (no echo race on fast typing), edits push to
	// Convex (debounced for free text, immediately for discrete controls), and
	// remote changes are adopted while the field is idle. `key` includes `open`
	// so the form re-seeds every time the drawer opens — in create mode `remote`
	// is the empty/initial value, so it resets; the `write`s no-op (patch guards
	// on `props.task`) and createTask reads the drafts directly.
	function key() {
		return `${String(props.open)}:${props.task?._id ?? "new"}`;
	}

	// Simplified patch: the server validator constrains the real payload.
	function patch(p: Record<string, unknown>) {
		if (props.task) void actions.update({ id: props.task._id, ...p });
	}

	const title = createSyncedField({
		remote: () => props.task?.title ?? "",
		key,
		write: (v) => {
			patch({ title: v });
		},
	});
	const status = createSyncedField<Task["status"]>({
		remote: () => props.task?.status ?? props.initialStatus ?? "backlog",
		key,
		write: (v) => {
			patch({ status: v });
		},
		debounceMs: 0,
	});
	const assignees = createSyncedField({
		remote: () => props.task?.assigneeIds ?? [],
		key,
		write: (v) => {
			patch({ assigneeIds: v });
		},
		debounceMs: 0,
		equals: shallowArrayEquals,
	});
	const projectId = createSyncedField({
		remote: () => props.task?.projectId,
		key,
		write: (v) => {
			patch({ projectId: v ?? null });
		},
		debounceMs: 0,
	});
	const dueDate = createSyncedField({
		remote: () => props.task?.dueDate,
		key,
		write: (v) => {
			patch({ dueDate: v ?? null });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.task?.description ?? "",
		key,
		write: (v) => {
			patch({ description: v });
		},
	});

	async function createTask() {
		if (!title.value().trim()) return;
		await actions.create({
			title: title.value().trim(),
			status: status.value(),
			assigneeIds: assignees.value(),
			projectId: projectId.value(),
			dueDate: dueDate.value(),
			description: description.value().trim() || undefined,
		});
		props.onOpenChange(false);
	}

	function deleteTask() {
		if (props.task) void actions.remove(props.task._id);
		props.onOpenChange(false);
	}

	return (
		<Drawer.Root
			open={props.open}
			onOpenChange={props.onOpenChange}
			initialFocusEl={() => titleEl ?? null}
		>
			<Drawer.Header>
				<Drawer.Title loading={props.loading}>
					{isEdit() ? "Task" : "New task"}
				</Drawer.Title>
				<Drawer.HeaderActions>
					<Show when={props.nav}>
						{(n) => (
							<DrawerNav
								onPrev={n().onPrev}
								onNext={n().onNext}
								hasPrev={n().hasPrev()}
								hasNext={n().hasNext()}
							/>
						)}
					</Show>
					<Show when={isEdit()}>
						<IconButton
							tooltipLabel="Delete task"
							onClick={deleteTask}
						>
							{ICONS.delete}
						</IconButton>
					</Show>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>
			<Drawer.Body
				loading={props.loading}
				skeleton={<TaskFieldsPlaceholder />}
			>
				<Input
					label="Title"
					maxLength={NAME_MAX}
					required
					ref={(el: HTMLInputElement) => {
						titleEl = el;
					}}
					class={styles.titleInput}
					placeholder="Task title"
					value={title.value()}
					onInput={(e) => {
						title.set(e.currentTarget.value);
					}}
					onBlur={title.flush}
				/>

				<PropertyRow
					icon={ICONS.status}
					label="Status"
					ref={(el) => {
						statusRowEl = el;
					}}
				>
					<Select.Root
						options={STATUS_OPTIONS}
						value={[status.value()]}
						sameWidth
						onValueChange={(d) => {
							const next = d.value[0] as Task["status"];
							const completed =
								next === "done" && status.value() !== "done";
							// Set first — the status write must never depend on the
							// decorative confetti, which can throw.
							status.set(next);
							if (completed) {
								try {
									fireConfetti(statusRowEl);
								} catch {
									/* decorative only */
								}
							}
						}}
					>
						<Select.Content>
							<For each={STATUS_OPTIONS}>
								{(o) => (
									<Select.Option
										value={o.value}
										title={o.title}
									/>
								)}
							</For>
						</Select.Content>
					</Select.Root>
				</PropertyRow>

				<PropertyRow icon={ICONS.assignees} label="Assignees">
					<AssigneeSelect
						people={props.people}
						value={assignees.value()}
						onChange={(ids) => {
							assignees.set(ids);
						}}
					/>
				</PropertyRow>

				<PropertyRow icon={ICONS.project} label="Project">
					<ProjectSelect
						projects={props.projects}
						value={projectId.value()}
						onChange={(id) => {
							projectId.set(id);
						}}
					/>
				</PropertyRow>

				<PropertyRow icon={ICONS.date} label="Due date">
					<DateField
						value={dueDate.value()}
						onChange={(ms) => {
							dueDate.set(ms);
						}}
					/>
				</PropertyRow>

				<div class={styles.description}>
					<TextArea
						label="Description"
						maxLength={TEXT_MAX}
						autoresize
						value={description.value()}
						onInput={(value) => {
							description.set(value);
						}}
						onBlur={description.flush}
					/>
				</div>
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<Drawer.Footer>
					<Button
						disabled={!title.value().trim()}
						disabledReason="Add a title first"
						onClick={createTask}
					>
						Create task
					</Button>
				</Drawer.Footer>
			</Show>
		</Drawer.Root>
	);
}
