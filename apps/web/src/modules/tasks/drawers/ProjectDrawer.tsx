import {
	Button,
	Drawer,
	DrawerNav,
	IconButton,
	Input,
	PropertyRow,
	TextArea,
} from "@j-os/design-system";
import { For, Show, type JSX } from "solid-js";

import { NAME_MAX, TEXT_MAX } from "../../../../convex/lib/validate.ts";
import { createSyncedField } from "../../../lib/createSyncedField.ts";
import { ICONS } from "../../../shared/icons.ts";
import { dateToIso, isoToMs } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useProjectActions } from "../data/tasksData.tsx";
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

export function ProjectDrawer(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	project?: Project;
	/** Create-mode date prefill (e.g. from dragging the timeline's "New" row). */
	initialStart?: number;
	initialEnd?: number;
	people: Person[];
	projects: Project[];
	tasks: Task[];
	onTaskClick: (task: Task) => void;
	/** True when the drawer is open for a real row (`selectedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `project` (which is undefined in both states). */
	loading?: boolean;
	nav?: {
		hasPrev: () => boolean;
		hasNext: () => boolean;
		onPrev: () => void;
		onNext: () => void;
	};
}): JSX.Element {
	const actions = useProjectActions();
	function isEdit() {
		return props.project !== undefined;
	}

	// Each field is a draft synced to its Convex value via createSyncedField (see
	// TaskDrawer for the rationale). `key` includes `open` so the form re-seeds
	// each time the drawer opens; in create mode `remote` is the empty/initial
	// value (start defaults to today) and the `write`s no-op since `patch` guards
	// on `props.project`.
	function key() {
		return `${String(props.open)}:${props.project?._id ?? "new"}`;
	}

	function patch(p: Record<string, unknown>) {
		if (props.project) void actions.update({ id: props.project._id, ...p });
	}

	const name = createSyncedField({
		remote: () => props.project?.name ?? "",
		key,
		write: (v) => {
			patch({ name: v });
		},
	});
	const leaderId = createSyncedField({
		remote: () => props.project?.leaderId,
		key,
		write: (v) => {
			patch({ leaderId: v ?? null });
		},
		debounceMs: 0,
	});
	const startDate = createSyncedField({
		// Create mode: use the dragged-range prefill if given, else today. An
		// existing project's unset start must stay unset.
		remote: () =>
			props.project
				? props.project.startDate
				: (props.initialStart ?? todayMs()),
		key,
		write: (v) => {
			patch({ startDate: v ?? null });
		},
		debounceMs: 0,
	});
	const endDate = createSyncedField({
		remote: () =>
			props.project ? props.project.endDate : props.initialEnd,
		key,
		write: (v) => {
			patch({ endDate: v ?? null });
		},
		debounceMs: 0,
	});
	const description = createSyncedField({
		remote: () => props.project?.description ?? "",
		key,
		write: (v) => {
			patch({ description: v });
		},
	});

	async function createProject() {
		if (!name.value().trim()) return;
		await actions.create({
			name: name.value().trim(),
			leaderId: leaderId.value(),
			startDate: startDate.value(),
			endDate: endDate.value(),
			description: description.value().trim() || undefined,
		});
		props.onOpenChange(false);
	}

	function deleteProject() {
		if (props.project) void actions.remove(props.project._id);
		props.onOpenChange(false);
	}

	function projectTasks() {
		return props.project
			? props.tasks.filter((t) => t.projectId === props.project!._id)
			: [];
	}

	return (
		<Drawer.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Drawer.Header>
				<Drawer.Title loading={props.loading}>
					{isEdit() ? "Project" : "New project"}
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
							tooltipLabel="Delete project"
							onClick={deleteProject}
						>
							{ICONS.delete}
						</IconButton>
					</Show>
					<Drawer.Close />
				</Drawer.HeaderActions>
			</Drawer.Header>
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
					value={name.value()}
					onInput={(e) => {
						name.set(e.currentTarget.value);
					}}
					onBlur={name.flush}
				/>

				<PropertyRow icon={ICONS.person} label="Leader">
					<PersonSelect
						people={props.people}
						value={leaderId.value()}
						placeholder="No leader"
						onChange={(id) => {
							leaderId.set(id);
						}}
					/>
				</PropertyRow>

				<PropertyRow icon={ICONS.start} label="Start">
					<DateField
						value={startDate.value()}
						onChange={(ms) => {
							startDate.set(ms);
							// Keep start ≤ end: pushing start past end drags end with it.
							const end = endDate.value();
							if (ms != null && end != null && ms > end)
								endDate.set(ms);
						}}
					/>
				</PropertyRow>

				<PropertyRow icon={ICONS.end} label="End">
					<DateField
						value={endDate.value()}
						onChange={(ms) => {
							endDate.set(ms);
							// Keep start ≤ end: pulling end before start drags start back.
							const start = startDate.value();
							if (ms != null && start != null && ms < start)
								startDate.set(ms);
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

				<Show when={isEdit()}>
					<section class={styles.tasks}>
						<h4>Tasks</h4>
						<Show
							when={projectTasks().length}
							fallback={<p class={styles.empty}>No tasks yet.</p>}
						>
							<ul>
								<For each={projectTasks()}>
									{(t) => (
										<li>
											<TaskCard
												task={t}
												people={props.people}
												projects={props.projects}
												hideProject
												pointer
												onClick={() => {
													props.onTaskClick(t);
												}}
											/>
										</li>
									)}
								</For>
							</ul>
						</Show>
					</section>
				</Show>
			</Drawer.Body>
			<Show when={!props.loading && !isEdit()}>
				<Drawer.Footer>
					<Button
						disabled={!name.value().trim()}
						disabledReason="Add a name first"
						onClick={createProject}
					>
						Create project
					</Button>
				</Drawer.Footer>
			</Show>
		</Drawer.Root>
	);
}
