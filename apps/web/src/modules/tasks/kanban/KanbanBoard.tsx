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
import { TASK_STATUSES, type TaskStatus } from "./onDrop.ts";
import { TaskCard } from "./TaskCard.tsx";

function DraggableCard(props: {
	task: Task;
	people: Person[];
	projects: Project[];
	selected: boolean;
	grouped: boolean;
	transformFor: (id: string, own: Vec) => Vec;
	onClick: () => void;
	onHoverIntent?: () => void;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- solid-dnd takes a stable id at creation time
	const draggable = createDraggable(props.task._id);
	function offset(): Vec {
		return props.transformFor(props.task._id, draggable.transform);
	}
	return (
		<div
			use:draggable
			class={styles.cardWrap}
			classList={{
				[styles.grouping]: props.grouped,
				[styles.dragActive]: draggable.isActiveDraggable,
			}}
			style={{
				"--drag-x": `${String(offset().x)}px`,
				"--drag-y": `${String(offset().y)}px`,
			}}
			data-task-id={props.task._id}
			data-selected={props.selected ? "" : undefined}
		>
			<TaskCard
				task={props.task}
				people={props.people}
				projects={props.projects}
				onClick={props.onClick}
				onHoverIntent={props.onHoverIntent}
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
	onCardHoverIntent?: (t: Task) => void;
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
										onHoverIntent={() => {
											props.onCardHoverIntent?.(task);
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
			onOpenChange={(isOpen) => {
				props.bulkDelete.setConfirmOpen(isOpen);
			}}
			initialFocusEl={() => cancelElement ?? null}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>
						Delete {props.count}{" "}
						{props.count === 1 ? "task" : "tasks"}?
					</Dialog.Title>
					<Dialog.Description>
						This can&rsquo;t be undone.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Footer>
					<Dialog.Cancel
						ref={(element) => {
							cancelElement = element;
						}}
					/>
					<Button onClick={props.bulkDelete.deleteSelected}>
						Delete
					</Button>
				</Dialog.Footer>
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
						"--marquee-x": `${String(marquee().x)}px`,
						"--marquee-y": `${String(marquee().y)}px`,
						"--marquee-w": `${String(marquee().w)}px`,
						"--marquee-h": `${String(marquee().h)}px`,
					}}
				/>
			)}
		</Show>
	);
}

type KanbanBoardProps = {
	tasks: Task[] | undefined;
	people: Person[];
	projects: Project[];
	onCardClick: (t: Task) => void;
	/** The pointer rested on a card: its sheet is about to open. */
	onCardHoverIntent?: (t: Task) => void;
	onAddTask: (status: TaskStatus) => void;
};

function Board(props: KanbanBoardProps): JSX.Element {
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
				data-part="kanban-board"
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
				<For each={TASK_STATUSES}>
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
							onCardHoverIntent={props.onCardHoverIntent}
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

export function KanbanBoard(props: KanbanBoardProps): JSX.Element {
	return (
		<DragDropProvider>
			<DragDropSensors>
				<Board {...props} />
			</DragDropSensors>
		</DragDropProvider>
	);
}
