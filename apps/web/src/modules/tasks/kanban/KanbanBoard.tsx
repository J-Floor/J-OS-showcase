import {
	Button,
	Dialog,
	IconButton,
	OWN_GESTURES_ATTR,
	Query,
} from "@j-os/design-system";
import {
	DragDropProvider,
	DragDropSensors,
	createDraggable,
	createDroppable,
	useDragDropContext,
} from "@thisbeyond/solid-dnd";
import { For, Show, type JSX } from "solid-js";

import { ICONS } from "../../../shared/icons.ts";
import { sortColumn } from "../data/taskHelpers.ts";
import {
	useTaskActions,
	type Person,
	type Project,
	type Task,
} from "../data/tasksData.tsx";

import styles from "./KanbanBoard.module.scss";
import {
	createBulkDelete,
	createDropHandler,
	createGroupDrag,
	createMarqueeSelection,
	createStatusOverrides,
	type Vec,
} from "./kanbanInteraction.ts";
import { COLUMNS, type TaskStatus } from "./onDrop.ts";
import { TaskCard } from "./TaskCard.tsx";

function DraggableCard(props: {
	task: Task;
	people: Person[];
	projects: Project[];
	selected: boolean;
	grouped: boolean;
	transformFor: (id: string, own: Vec) => Vec;
	onClick: () => void;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- solid-dnd takes a stable id at creation time
	const draggable = createDraggable(props.task._id);
	function transform(): string {
		const offset = props.transformFor(props.task._id, draggable.transform);
		return `translate(${String(offset.x)}px, ${String(offset.y)}px)`;
	}
	return (
		<div
			use:draggable
			class={styles.cardWrap}
			classList={{
				[styles.grouping]: props.grouped,
				[styles.dragActive]: draggable.isActiveDraggable,
			}}
			style={{ transform: transform() }}
			data-task-id={props.task._id}
			data-selected={props.selected ? "" : undefined}
		>
			<TaskCard
				task={props.task}
				people={props.people}
				projects={props.projects}
				onClick={props.onClick}
			/>
		</div>
	);
}

function Column(props: {
	id: TaskStatus;
	label: string;
	tasks: Task[] | undefined;
	people: Person[];
	projects: Project[];
	isSelected: (id: string) => boolean;
	isGrouped: (id: string) => boolean;
	transformFor: (id: string, own: Vec) => Vec;
	onCardClick: (t: Task) => void;
	onAdd: () => void;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- solid-dnd takes a stable id at creation time
	const droppable = createDroppable(props.id);
	return (
		<div
			use:droppable
			class={styles.column}
			classList={{ [styles.over]: droppable.isActiveDroppable }}
		>
			<Query.Root data={props.tasks}>
				<header class={styles.columnHead}>
					{props.label}
					<div class={styles.headRight}>
						<span class={styles.count} data-column-count="">
							<Query.Count />
						</span>
						<IconButton
							tooltipLabel={`Add task to ${props.label}`}
							onClick={() => {
								props.onAdd();
							}}
						>
							{ICONS.add}
						</IconButton>
					</div>
				</header>
				<div class={styles.cards}>
					<Query.Content of={props.tasks}>
						{(tasks) => (
							<For each={sortColumn(tasks())}>
								{(task) => (
									<DraggableCard
										task={task}
										people={props.people}
										projects={props.projects}
										selected={props.isSelected(task._id)}
										grouped={props.isGrouped(task._id)}
										transformFor={props.transformFor}
										onClick={() => {
											props.onCardClick(task);
										}}
									/>
								)}
							</For>
						)}
					</Query.Content>
				</div>
			</Query.Root>
		</div>
	);
}

/** The confirm dialog for bulk delete; focuses Cancel when it opens (safer
 *  default than Delete/close). */
function BulkDeleteDialog(props: {
	count: number;
	bulkDelete: ReturnType<typeof createBulkDelete>;
}) {
	let cancelElement: HTMLElement | undefined;
	return (
		<Dialog.Root
			open={props.bulkDelete.confirmOpen()}
			onOpenChange={(details) => {
				props.bulkDelete.setConfirmOpen(details.open);
			}}
			initialFocusEl={() => cancelElement ?? null}
		>
			<Dialog.Content>
				<Dialog.Title>
					Delete {props.count} {props.count === 1 ? "task" : "tasks"}?
				</Dialog.Title>
				<Dialog.Description>
					This can&rsquo;t be undone.
				</Dialog.Description>
				<div class={styles.confirmActions}>
					<Button
						variant="tertiary"
						ref={(element) => {
							cancelElement = element;
						}}
						onClick={() => {
							props.bulkDelete.setConfirmOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button onClick={props.bulkDelete.deleteSelected}>
						Delete
					</Button>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	);
}

/** The rubber-band rectangle while a marquee drag is under way. */
function MarqueeOutline(props: {
	marquee: ReturnType<typeof createMarqueeSelection>["marquee"];
}): JSX.Element {
	return (
		<Show when={props.marquee()}>
			{(marquee) => (
				<div
					class={styles.marquee}
					style={{
						left: `${String(marquee().x)}px`,
						top: `${String(marquee().y)}px`,
						width: `${String(marquee().w)}px`,
						height: `${String(marquee().h)}px`,
					}}
				/>
			)}
		</Show>
	);
}

function Board(props: {
	tasks: Task[] | undefined;
	people: Person[];
	projects: Project[];
	onCardClick: (t: Task) => void;
	onAddTask: (status: TaskStatus) => void;
}): JSX.Element {
	const context = useDragDropContext()!;
	function tasks(): Task[] | undefined {
		return props.tasks;
	}
	const overrides = createStatusOverrides({ tasks });
	const selection = createMarqueeSelection();
	const groupDrag = createGroupDrag({ context, selection });
	const actions = useTaskActions();
	createDropHandler({
		context,
		selection,
		groupDrag,
		overrides,
		tasks,
		actions,
	});
	const bulkDelete = createBulkDelete({ selection, actions });

	function byStatus(status: TaskStatus): Task[] | undefined {
		return props.tasks?.filter(
			(task) => overrides.statusOf(task) === status
		);
	}

	return (
		<>
			<div
				ref={selection.setBoardElement}
				class={styles.board}
				// Cards drag and the background draws a marquee: never a tab swipe.
				{...{ [OWN_GESTURES_ATTR]: "" }}
				onPointerDown={(event) => {
					selection.onPointerDown(event);
				}}
				onPointerMove={(event) => {
					selection.onPointerMove(event);
				}}
				onPointerUp={(event) => {
					selection.onPointerUp(event);
				}}
			>
				<For each={COLUMNS}>
					{(col) => (
						<Column
							id={col.id}
							label={col.label}
							tasks={byStatus(col.id)}
							people={props.people}
							projects={props.projects}
							isSelected={selection.isSelected}
							isGrouped={groupDrag.isGrouped}
							transformFor={groupDrag.transformFor}
							onCardClick={props.onCardClick}
							onAdd={() => {
								props.onAddTask(col.id);
							}}
						/>
					)}
				</For>
				<MarqueeOutline marquee={selection.marquee} />
			</div>
			<BulkDeleteDialog
				count={selection.selected().size}
				bulkDelete={bulkDelete}
			/>
		</>
	);
}

export function KanbanBoard(props: {
	tasks: Task[] | undefined;
	people: Person[];
	projects: Project[];
	onCardClick: (t: Task) => void;
	onAddTask: (status: TaskStatus) => void;
}): JSX.Element {
	return (
		<DragDropProvider>
			<DragDropSensors>
				<Board {...props} />
			</DragDropSensors>
		</DragDropProvider>
	);
}
