import { fireConfetti } from "@j-os/design-system";
import { useDragDropContext } from "@thisbeyond/solid-dnd";
import {
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	type Accessor,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { Task, TaskActions } from "../data/tasksData.tsx";

import { COLUMNS, type TaskStatus } from "./onDrop.ts";

type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

/** Optimistic status overrides: on drop, reflect the new column immediately so
 *  the card doesn't snap back to its origin while the Convex round-trip lands. */
export function createStatusOverrides(options: {
	tasks: Accessor<Task[] | undefined>;
}) {
	const [override, setOverride] = createSignal<Record<string, TaskStatus>>(
		{}
	);

	createEffect(() => {
		const tasks = options.tasks() ?? [];
		setOverride((current) => {
			const next: Record<string, TaskStatus> = {};
			let isChanged = false;
			for (const [id, st] of Object.entries(current)) {
				const live = tasks.find((task) => task._id === id);
				if (live && live.status !== st) next[id] = st;
				else isChanged = true;
			}
			return isChanged ? next : current;
		});
	});

	return {
		setOverride,
		statusOf(task: Task): string {
			return override()[task._id] ?? task.status;
		},
	};
}

/** Marquee selection: drag across empty space to select the cards it touches. */
export function createMarqueeSelection() {
	const [selected, setSelected] = createSignal<Set<string>>(
		new Set<string>()
	);
	const [marquee, setMarquee] = createSignal<Rect | null>(null);
	let boardElement: HTMLDivElement | undefined;
	let isSelecting = false;
	let startX = 0;
	let startY = 0;

	return {
		selected,
		setSelected,
		marquee,
		board: (): HTMLDivElement | undefined => boardElement,
		setBoardElement: (element: HTMLDivElement): void => {
			boardElement = element;
		},
		isSelected: (id: string): boolean => selected().has(id),
		onPointerDown: (event: PointerEvent): void => {
			if (event.button !== 0 || !boardElement) return;
			const target = event.target as HTMLElement;
			if (target.closest("[data-task-id], button, a, input, textarea"))
				return;
			isSelecting = true;
			startX = event.clientX;
			startY = event.clientY;
			setSelected(new Set<string>());
			// Don't render the rect yet — a plain click would flash a 1px box.
			boardElement.setPointerCapture(event.pointerId);
		},
		onPointerMove: (event: PointerEvent): void => {
			if (!isSelecting || !boardElement) return;
			const br = boardElement.getBoundingClientRect();
			const left = Math.min(startX, event.clientX);
			const top = Math.min(startY, event.clientY);
			const right = Math.max(startX, event.clientX);
			const bottom = Math.max(startY, event.clientY);
			setMarquee({
				x: left - br.left,
				y: top - br.top,
				w: right - left,
				h: bottom - top,
			});
			const hits = new Set<string>();
			boardElement
				.querySelectorAll<HTMLElement>("[data-task-id]")
				.forEach((element) => {
					const rect = element.getBoundingClientRect();
					if (
						rect.left < right &&
						rect.right > left &&
						rect.top < bottom &&
						rect.bottom > top
					) {
						hits.add(element.dataset.taskId ?? "");
					}
				});
			setSelected(hits);
		},
		onPointerUp: (event: PointerEvent): void => {
			if (!isSelecting) return;
			isSelecting = false;
			setMarquee(null);
			boardElement?.releasePointerCapture(event.pointerId);
		},
	};
}

type DragContext = NonNullable<ReturnType<typeof useDragDropContext>>;
type MarqueeSelection = ReturnType<typeof createMarqueeSelection>;

/** Group drag: selected cards slide onto the dragged card. Per-card offset
 *  (captured at drag start) brings each selected card to the dragged card's
 *  origin; it is added to the live drag delta during the drag. */
export function createGroupDrag(options: {
	context: DragContext;
	selection: MarqueeSelection;
}) {
	const { context, selection } = options;
	const dndState = context[0];
	const [offsets, setOffsets] = createSignal<Map<string, Vec>>(new Map());
	function activeId(): string | null {
		const active = dndState.active.draggable;
		return active ? String(active.id) : null;
	}
	function activeTransform(): Vec {
		return dndState.active.draggable?.transform ?? { x: 0, y: 0 };
	}

	context[1].onDragStart(({ draggable }) => {
		const aid = String(draggable.id);
		const board = selection.board();
		if (
			!board ||
			!selection.selected().has(aid) ||
			selection.selected().size < 2
		) {
			setOffsets(new Map());
			return;
		}
		const activeElement = board.querySelector(`[data-task-id="${aid}"]`);
		if (!activeElement) return;
		const ar = activeElement.getBoundingClientRect();
		const map = new Map<string, Vec>();
		selection.selected().forEach((id) => {
			if (id === aid) return;
			const element = board.querySelector(`[data-task-id="${id}"]`);
			if (!element) return;
			const rect = element.getBoundingClientRect();
			map.set(id, { x: ar.left - rect.left, y: ar.top - rect.top });
		});
		setOffsets(map);
	});

	return {
		clearOffsets: (): void => {
			setOffsets(new Map());
		},
		isGrouped: (id: string): boolean => {
			const aid = activeId();
			return aid !== null && id !== aid && offsets().has(id);
		},
		transformFor: (id: string, own: Vec): Vec => {
			const aid = activeId();
			if (aid === null) return { x: 0, y: 0 };
			if (id === aid) return own; // dragged card tracks the cursor (solid-dnd)
			const off = offsets().get(id);
			if (!off) return { x: 0, y: 0 };
			const drag = activeTransform();
			return { x: off.x + drag.x, y: off.y + drag.y };
		},
	};
}

/** Dropping on a column moves the dragged card — or the whole selection if it
 *  is part of it — to that column. */
export function createDropHandler(options: {
	context: DragContext;
	selection: MarqueeSelection;
	groupDrag: ReturnType<typeof createGroupDrag>;
	overrides: ReturnType<typeof createStatusOverrides>;
	tasks: Accessor<Task[] | undefined>;
	actions: TaskActions;
}) {
	const { selection, overrides, actions } = options;

	options.context[1].onDragEnd(({ draggable, droppable }) => {
		options.groupDrag.clearOffsets();
		if (!droppable) return;
		const status = COLUMNS.find(
			(column) => column.id === String(droppable.id)
		)?.id;
		if (!status) return;
		const selected = selection.selected();
		const draggedId = String(draggable.id);
		const ids = selected.has(draggedId) ? [...selected] : [draggedId];
		// Which cards actually change column? Must be read BEFORE setOverride —
		// once the optimistic override is written, statusOf() returns the new
		// status and every card looks unchanged (so nothing would persist).
		const moved = ids.filter((id) => {
			const task = options
				.tasks()
				?.find((candidate) => candidate._id === id);
			return task !== undefined && overrides.statusOf(task) !== status;
		});
		const isCompleted = status === "done" && moved.length > 0;
		overrides.setOverride((current) => {
			const next = { ...current };
			for (const id of ids) next[id] = status;
			return next;
		});
		for (const id of moved) {
			void actions.update({ id: id as Id<"tasks">, status });
		}
		if (isCompleted) {
			// Burst from the card's resting spot in Done — wait a frame for the
			// re-render to move it there.
			requestAnimationFrame(() => {
				try {
					fireConfetti(
						selection
							.board()
							?.querySelector<HTMLElement>(
								`[data-task-id="${draggedId}"]`
							) ?? undefined
					);
				} catch {
					/* decorative only */
				}
			});
		}
		selection.setSelected(new Set<string>());
	});
}

/** Backspace/Delete → confirm → bulk delete of the selected cards. */
export function createBulkDelete(options: {
	selection: MarqueeSelection;
	actions: TaskActions;
}) {
	const { selection, actions } = options;
	const [confirmOpen, setConfirmOpen] = createSignal(false);

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== "Backspace" && event.key !== "Delete") return;
		if (selection.selected().size === 0) return;
		const focused = document.activeElement as HTMLElement | null;
		if (
			focused &&
			(focused.tagName === "INPUT" ||
				focused.tagName === "TEXTAREA" ||
				focused.isContentEditable)
		) {
			return;
		}
		if (document.querySelector('[role="dialog"][data-state="open"]'))
			return;
		event.preventDefault();
		setConfirmOpen(true);
	}
	onMount(() => {
		document.addEventListener("keydown", onKeyDown);
	});
	onCleanup(() => {
		document.removeEventListener("keydown", onKeyDown);
	});

	return {
		confirmOpen,
		setConfirmOpen,
		deleteSelected: (): void => {
			const ids = [...selection.selected()];
			setConfirmOpen(false);
			selection.setSelected(new Set<string>());
			for (const id of ids) void actions.remove(id as Id<"tasks">);
		},
	};
}
