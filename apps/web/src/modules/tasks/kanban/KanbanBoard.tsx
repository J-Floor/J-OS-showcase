import { Button, Dialog, IconButton, fireConfetti } from "@j-os/design-system";
import {
	DragDropProvider,
	DragDropSensors,
	createDraggable,
	createDroppable,
	useDragDropContext,
} from "@thisbeyond/solid-dnd";
import {
	For,
	Show,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	type JSX,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { ICONS } from "../../../shared/icons.ts";
import { sortColumn } from "../data/taskHelpers.ts";
import type { Person, Project, Task } from "../data/tasksData.tsx";
import { useTaskActions } from "../data/tasksData.tsx";

import styles from "./KanbanBoard.module.scss";
import { COLUMNS, type TaskStatus } from "./onDrop.ts";
import { TaskCard } from "./TaskCard.tsx";

type Rect = { x: number; y: number; w: number; h: number };
type Vec = { x: number; y: number };

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
		const t = props.transformFor(props.task._id, draggable.transform);
		return `translate(${String(t.x)}px, ${String(t.y)}px)`;
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
	tasks: Task[];
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
			<header class={styles.columnHead}>
				{props.label}
				<div class={styles.headRight}>
					<span class={styles.count}>{props.tasks.length}</span>
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
				<For each={sortColumn(props.tasks)}>
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
			</div>
		</div>
	);
}

function Board(props: {
	tasks: Task[];
	people: Person[];
	projects: Project[];
	onCardClick: (t: Task) => void;
	onAddTask: (status: TaskStatus) => void;
}): JSX.Element {
	const actions = useTaskActions();
	const ctx = useDragDropContext()!;
	const dndState = ctx[0];

	// Optimistic status overrides: on drop, reflect the new column immediately so
	// the card doesn't snap back to its origin while the Convex round-trip lands.
	const [override, setOverride] = createSignal<Record<string, TaskStatus>>(
		{}
	);
	function statusOf(t: Task): string {
		return override()[t._id] ?? t.status;
	}

	createEffect(() => {
		const tasks = props.tasks;
		setOverride((current) => {
			const next: Record<string, TaskStatus> = {};
			let changed = false;
			for (const [id, st] of Object.entries(current)) {
				const live = tasks.find((t) => t._id === id);
				if (live && live.status !== st) next[id] = st;
				else changed = true;
			}
			return changed ? next : current;
		});
	});

	// --- Selection (marquee) -------------------------------------------------
	const [selected, setSelected] = createSignal<Set<string>>(
		new Set<string>()
	);
	function isSelected(id: string): boolean {
		return selected().has(id);
	}
	const [marquee, setMarquee] = createSignal<Rect | null>(null);
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's ref={boardEl} binding
	let boardEl: HTMLDivElement | undefined;
	let selecting = false;
	let startX = 0;
	let startY = 0;

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 || !boardEl) return;
		const target = e.target as HTMLElement;
		if (target.closest("[data-task-id], button, a, input, textarea"))
			return;
		selecting = true;
		startX = e.clientX;
		startY = e.clientY;
		setSelected(new Set<string>());
		// Don't render the rect yet — a plain click would flash a 1px box.
		boardEl.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!selecting || !boardEl) return;
		const br = boardEl.getBoundingClientRect();
		const left = Math.min(startX, e.clientX);
		const top = Math.min(startY, e.clientY);
		const right = Math.max(startX, e.clientX);
		const bottom = Math.max(startY, e.clientY);
		setMarquee({
			x: left - br.left,
			y: top - br.top,
			w: right - left,
			h: bottom - top,
		});
		const hits = new Set<string>();
		boardEl
			.querySelectorAll<HTMLElement>("[data-task-id]")
			.forEach((el) => {
				const r = el.getBoundingClientRect();
				if (
					r.left < right &&
					r.right > left &&
					r.top < bottom &&
					r.bottom > top
				) {
					hits.add(el.dataset.taskId ?? "");
				}
			});
		setSelected(hits);
	}
	function onPointerUp(e: PointerEvent) {
		if (!selecting) return;
		selecting = false;
		setMarquee(null);
		boardEl?.releasePointerCapture(e.pointerId);
	}

	// --- Group drag: selected cards slide onto the dragged card --------------
	// Per-card offset (captured at drag start) that brings each selected card to
	// the dragged card's origin; added to the live drag delta during the drag.
	const [offsets, setOffsets] = createSignal<Map<string, Vec>>(new Map());
	function activeId(): string | null {
		const a = dndState.active.draggable;
		return a ? String(a.id) : null;
	}
	function activeTransform(): Vec {
		return dndState.active.draggable?.transform ?? { x: 0, y: 0 };
	}
	function isGrouped(id: string): boolean {
		const aid = activeId();
		return aid !== null && id !== aid && offsets().has(id);
	}
	function transformFor(id: string, own: Vec): Vec {
		const aid = activeId();
		if (aid === null) return { x: 0, y: 0 };
		if (id === aid) return own; // dragged card tracks the cursor (solid-dnd)
		const off = offsets().get(id);
		if (!off) return { x: 0, y: 0 };
		const t = activeTransform();
		return { x: off.x + t.x, y: off.y + t.y };
	}

	// eslint-disable-next-line solid/reactivity -- onDragStart registers a callback, not a reactive read
	ctx[1].onDragStart(({ draggable }) => {
		const aid = String(draggable.id);
		const board = boardEl;
		if (!board || !selected().has(aid) || selected().size < 2) {
			setOffsets(new Map());
			return;
		}
		const activeEl = board.querySelector(`[data-task-id="${aid}"]`);
		if (!activeEl) return;
		const ar = activeEl.getBoundingClientRect();
		const map = new Map<string, Vec>();
		selected().forEach((id) => {
			if (id === aid) return;
			const el = board.querySelector(`[data-task-id="${id}"]`);
			if (!el) return;
			const r = el.getBoundingClientRect();
			map.set(id, { x: ar.left - r.left, y: ar.top - r.top });
		});
		setOffsets(map);
	});

	// eslint-disable-next-line solid/reactivity -- onDragEnd registers a callback, not a reactive read
	ctx[1].onDragEnd(({ draggable, droppable }) => {
		setOffsets(new Map());
		if (!droppable) return;
		const status = COLUMNS.find((c) => c.id === String(droppable.id))?.id;
		if (!status) return;
		const draggedId = String(draggable.id);
		const ids = selected().has(draggedId) ? [...selected()] : [draggedId];
		// Which cards actually change column? Must be read BEFORE setOverride —
		// once the optimistic override is written, statusOf() returns the new
		// status and every card looks unchanged (so nothing would persist).
		const moved = ids.filter((id) => {
			const t = props.tasks.find((x) => x._id === id);
			return t !== undefined && statusOf(t) !== status;
		});
		const completed = status === "done" && moved.length > 0;
		setOverride((o) => {
			const next = { ...o };
			for (const id of ids) next[id] = status;
			return next;
		});
		for (const id of moved) {
			void actions.update({ id: id as Id<"tasks">, status });
		}
		if (completed) {
			// Burst from the card's resting spot in Done — wait a frame for the
			// re-render to move it there.
			requestAnimationFrame(() => {
				try {
					fireConfetti(
						boardEl?.querySelector<HTMLElement>(
							`[data-task-id="${draggedId}"]`
						) ?? undefined
					);
				} catch {
					/* decorative only */
				}
			});
		}
		setSelected(new Set<string>());
	});

	// --- Backspace/Delete → confirm → bulk delete ----------------------------
	const [confirmOpen, setConfirmOpen] = createSignal(false);
	// Focused when the confirm dialog opens (safer default than Delete/close).
	let cancelEl: HTMLElement | undefined;
	function onKeyDown(e: KeyboardEvent) {
		if (e.key !== "Backspace" && e.key !== "Delete") return;
		if (selected().size === 0) return;
		const a = document.activeElement as HTMLElement | null;
		if (
			a &&
			(a.tagName === "INPUT" ||
				a.tagName === "TEXTAREA" ||
				a.isContentEditable)
		) {
			return;
		}
		if (document.querySelector('[role="dialog"][data-state="open"]'))
			return;
		e.preventDefault();
		setConfirmOpen(true);
	}
	onMount(() => {
		document.addEventListener("keydown", onKeyDown);
	});
	onCleanup(() => {
		document.removeEventListener("keydown", onKeyDown);
	});

	function deleteSelected() {
		const ids = [...selected()];
		setConfirmOpen(false);
		setSelected(new Set<string>());
		for (const id of ids) void actions.remove(id as Id<"tasks">);
	}

	function byStatus(s: TaskStatus): Task[] {
		return props.tasks.filter((t) => statusOf(t) === s);
	}

	return (
		<>
			<div
				ref={boardEl}
				class={styles.board}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
			>
				<For each={COLUMNS}>
					{(col) => (
						<Column
							id={col.id}
							label={col.label}
							tasks={byStatus(col.id)}
							people={props.people}
							projects={props.projects}
							isSelected={isSelected}
							isGrouped={isGrouped}
							transformFor={transformFor}
							onCardClick={props.onCardClick}
							onAdd={() => {
								props.onAddTask(col.id);
							}}
						/>
					)}
				</For>
				<Show when={marquee()}>
					{(m) => (
						<div
							class={styles.marquee}
							style={{
								left: `${String(m().x)}px`,
								top: `${String(m().y)}px`,
								width: `${String(m().w)}px`,
								height: `${String(m().h)}px`,
							}}
						/>
					)}
				</Show>
			</div>

			<Dialog.Root
				open={confirmOpen()}
				onOpenChange={(d) => {
					setConfirmOpen(d.open);
				}}
				initialFocusEl={() => cancelEl ?? null}
			>
				<Dialog.Content>
					<Dialog.Title>
						Delete {selected().size}{" "}
						{selected().size === 1 ? "task" : "tasks"}?
					</Dialog.Title>
					<Dialog.Description>
						This can&rsquo;t be undone.
					</Dialog.Description>
					<div class={styles.confirmActions}>
						<Button
							variant="tertiary"
							ref={(el) => {
								cancelEl = el;
							}}
							onClick={() => {
								setConfirmOpen(false);
							}}
						>
							Cancel
						</Button>
						<Button onClick={deleteSelected}>Delete</Button>
					</div>
				</Dialog.Content>
			</Dialog.Root>
		</>
	);
}

export function KanbanBoard(props: {
	tasks: Task[];
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
