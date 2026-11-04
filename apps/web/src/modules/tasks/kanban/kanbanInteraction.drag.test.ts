// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { toasterCreate, celebrate } = vi.hoisted(() => ({
	toasterCreate: vi.fn(),
	celebrate: vi.fn(),
}));
vi.mock("../../../shared/toaster.ts", () => ({
	toaster: { create: toasterCreate },
}));
vi.mock("../../../lib/celebrate.ts", () => ({ celebrate }));

import type { Task, TaskActions } from "../data/tasksData.tsx";

import {
	createDropHandler,
	createGroupDrag,
	createMarqueeSelection,
	createStatusOverrides,
} from "./kanbanInteraction.ts";

type Handler = (event: {
	draggable: { id: string };
	droppable?: { id: string } | null;
}) => void;

/** The slice of solid-dnd's context the board's drag hooks read. */
function fakeDndContext() {
	const handlers: { start?: Handler; end?: Handler } = {};
	const state = {
		active: {
			draggable: null as {
				id: string;
				transform: { x: number; y: number };
			} | null,
		},
	};
	const context = [
		state,
		{
			onDragStart: (handler: Handler) => {
				handlers.start = handler;
			},
			onDragEnd: (handler: Handler) => {
				handlers.end = handler;
			},
		},
	] as never;
	return { context, handlers, state };
}

function box(left: number, top: number, width: number, height: number) {
	return () =>
		({
			left,
			top,
			right: left + width,
			bottom: top + height,
			width,
			height,
			x: left,
			y: top,
		}) as DOMRect;
}

/** A board with one card per `[id, left, top]`, each 100 x 50. */
function makeBoard(cards: [string, number, number][]) {
	const board = document.createElement("div");
	board.getBoundingClientRect = box(0, 0, 1000, 1000);
	const capture = vi.fn();
	const release = vi.fn();
	board.setPointerCapture = capture;
	board.releasePointerCapture = release;
	for (const [id, left, top] of cards) {
		const card = document.createElement("div");
		card.dataset.taskId = id;
		card.getBoundingClientRect = box(left, top, 100, 50);
		board.append(card);
	}
	document.body.append(board);
	return { board, capture, release };
}

function pointer(
	target: Element,
	x: number,
	y: number,
	button = 0
): PointerEvent {
	return {
		button,
		target,
		clientX: x,
		clientY: y,
		pointerId: 7,
	} as unknown as PointerEvent;
}

const disposers: (() => void)[] = [];
function inRoot<T>(make: () => T): T {
	return createRoot((done) => {
		disposers.push(done);
		return make();
	});
}
function disposeAll(): void {
	for (const done of disposers.splice(0)) done();
}

beforeEach(() => {
	toasterCreate.mockReset();
	celebrate.mockReset();
});
afterEach(() => {
	disposeAll();
	document.body.innerHTML = "";
});

describe("createMarqueeSelection", () => {
	it("selects the cards the dragged rectangle touches and draws it relative to the board", () => {
		const { board, capture } = makeBoard([
			["a", 10, 10],
			["b", 300, 10],
		]);
		const selection = inRoot(createMarqueeSelection);
		selection.setBoardElement(board);

		selection.onPointerDown(pointer(board, 200, 200));
		expect(selection.marquee()).toBeNull();
		expect(capture).toHaveBeenCalledWith(7);

		selection.onPointerMove(pointer(board, 50, 30));
		expect([...selection.selected()]).toEqual(["a"]);
		expect(selection.marquee()).toEqual({ x: 50, y: 30, w: 150, h: 170 });

		selection.onPointerMove(pointer(board, 350, 30));
		expect(
			[...selection.selected()].sort((first, second) =>
				first.localeCompare(second)
			)
		).toEqual(["b"]);
	});

	it("clears the rectangle and releases the pointer on release, keeping the selection", () => {
		const { board, release } = makeBoard([["a", 10, 10]]);
		const selection = inRoot(createMarqueeSelection);
		selection.setBoardElement(board);
		selection.onPointerDown(pointer(board, 200, 200));
		selection.onPointerMove(pointer(board, 20, 20));

		selection.onPointerUp(pointer(board, 20, 20));

		expect(selection.marquee()).toBeNull();
		expect(release).toHaveBeenCalledWith(7);
		expect(selection.isSelected("a")).toBe(true);
		// Further movement no longer changes the selection.
		selection.onPointerMove(pointer(board, 900, 900));
		expect(selection.isSelected("a")).toBe(true);
	});

	it("ignores presses on a card, a control or with another button", () => {
		const { board, capture } = makeBoard([["a", 10, 10]]);
		const button = document.createElement("button");
		board.append(button);
		const selection = inRoot(createMarqueeSelection);
		selection.setBoardElement(board);
		selection.setSelected(new Set(["kept"]));

		selection.onPointerDown(pointer(board.firstElementChild!, 0, 0));
		selection.onPointerDown(pointer(button, 0, 0));
		selection.onPointerDown(pointer(board, 0, 0, 2));
		selection.onPointerMove(pointer(board, 500, 500));

		expect(capture).not.toHaveBeenCalled();
		expect(selection.marquee()).toBeNull();
		expect([...selection.selected()]).toEqual(["kept"]);
	});

	it("starts a new selection from scratch on each press", () => {
		const { board } = makeBoard([["a", 10, 10]]);
		const selection = inRoot(createMarqueeSelection);
		selection.setBoardElement(board);
		selection.setSelected(new Set(["a"]));

		selection.onPointerDown(pointer(board, 500, 500));

		expect(selection.selected().size).toBe(0);
	});
});

function task(id: string, status: Task["status"]): Task {
	return { _id: id, status } as unknown as Task;
}

function succeeded() {
	return { isErr: () => false };
}

function startDrag(dnd: ReturnType<typeof fakeDndContext>, id: string) {
	dnd.state.active.draggable = { id, transform: { x: 5, y: 7 } };
	dnd.handlers.start?.({ draggable: { id } });
}

function setupGroup(selected: string[]) {
	const { board } = makeBoard([
		["a", 100, 100],
		["b", 300, 400],
		["c", 600, 600],
	]);
	const dnd = fakeDndContext();
	const { selection, groupDrag } = inRoot(() => {
		const marquee = createMarqueeSelection();
		marquee.setBoardElement(board);
		marquee.setSelected(new Set(selected));
		return {
			selection: marquee,
			groupDrag: createGroupDrag({
				context: dnd.context,
				selection: marquee,
			}),
		};
	});
	return { dnd, selection, groupDrag };
}

describe("createGroupDrag", () => {
	it("slides the other selected cards onto the dragged card, following its movement", () => {
		const { dnd, groupDrag } = setupGroup(["a", "b"]);
		startDrag(dnd, "a");

		expect(groupDrag.isGrouped("b")).toBe(true);
		expect(groupDrag.isGrouped("a")).toBe(false);
		expect(groupDrag.isGrouped("c")).toBe(false);
		// Offset to a's origin (100-300, 100-400) plus the drag's own delta.
		expect(groupDrag.transformFor("b", { x: 0, y: 0 })).toEqual({
			x: -195,
			y: -293,
		});
		expect(groupDrag.transformFor("a", { x: 5, y: 7 })).toEqual({
			x: 5,
			y: 7,
		});
		expect(groupDrag.transformFor("c", { x: 0, y: 0 })).toEqual({
			x: 0,
			y: 0,
		});
	});

	it("groups nothing when the dragged card is alone or outside the selection", () => {
		const alone = setupGroup(["a"]);
		startDrag(alone.dnd, "a");
		expect(alone.groupDrag.isGrouped("b")).toBe(false);
		disposeAll();

		const outside = setupGroup(["b", "c"]);
		startDrag(outside.dnd, "a");
		expect(outside.groupDrag.isGrouped("b")).toBe(false);
		expect(outside.groupDrag.isGrouped("c")).toBe(false);
	});

	it("stops moving grouped cards once the offsets are cleared or no drag is active", () => {
		const { dnd, groupDrag } = setupGroup(["a", "b"]);
		startDrag(dnd, "a");

		groupDrag.clearOffsets();
		expect(groupDrag.isGrouped("b")).toBe(false);
		expect(groupDrag.transformFor("b", { x: 0, y: 0 })).toEqual({
			x: 0,
			y: 0,
		});

		startDrag(dnd, "a");
		dnd.state.active.draggable = null;
		expect(groupDrag.transformFor("b", { x: 0, y: 0 })).toEqual({
			x: 0,
			y: 0,
		});
	});
});

describe("createDropHandler", () => {
	const ok = succeeded();
	const refused = { isErr: () => true, error: { message: "Not allowed." } };

	function setup(options: {
		tasks: Task[];
		selected?: string[];
		outcome?: unknown;
	}) {
		const { board } = makeBoard([["x", 0, 0]]);
		const dnd = fakeDndContext();
		const update = vi.fn().mockResolvedValue(options.outcome ?? ok);
		const { overrides, selection, groupDrag } = inRoot(() => {
			const [tasks] = createSignal<Task[] | undefined>(options.tasks);
			const marquee = createMarqueeSelection();
			marquee.setBoardElement(board);
			marquee.setSelected(new Set(options.selected ?? []));
			const statusOverrides = createStatusOverrides({ tasks });
			const drag = createGroupDrag({
				context: dnd.context,
				selection: marquee,
			});
			createDropHandler({
				context: dnd.context,
				selection: marquee,
				groupDrag: drag,
				overrides: statusOverrides,
				tasks,
				actions: { update } as unknown as TaskActions,
			});
			return {
				overrides: statusOverrides,
				selection: marquee,
				groupDrag: drag,
			};
		});
		function drop(id: string, column: string | null) {
			dnd.handlers.end?.({
				draggable: { id },
				droppable: column === null ? null : { id: column },
			});
		}
		return { drop, update, overrides, selection, groupDrag, options };
	}

	it("moves the dropped card to the column and shows it there at once", () => {
		const { drop, update, overrides, options } = setup({
			tasks: [task("t1", "backlog")],
		});

		drop("t1", "in_progress");

		expect(overrides.statusOf(options.tasks[0])).toBe("in_progress");
		expect(update).toHaveBeenCalledExactlyOnceWith({
			id: "t1",
			status: "in_progress",
		});
	});

	it("moves every selected card when the dragged one is selected, and clears the selection", () => {
		const { drop, update, selection } = setup({
			tasks: [
				task("t1", "backlog"),
				task("t2", "backlog"),
				task("t3", "backlog"),
			],
			selected: ["t1", "t2"],
		});

		drop("t1", "in_progress");

		expect(update).toHaveBeenCalledTimes(2);
		expect(update).toHaveBeenCalledWith({
			id: "t1",
			status: "in_progress",
		});
		expect(update).toHaveBeenCalledWith({
			id: "t2",
			status: "in_progress",
		});
		expect(selection.selected().size).toBe(0);
	});

	it("moves only the dragged card when it is outside the selection", () => {
		const { drop, update } = setup({
			tasks: [task("t1", "backlog"), task("t2", "backlog")],
			selected: ["t2"],
		});

		drop("t1", "in_progress");

		expect(update).toHaveBeenCalledExactlyOnceWith({
			id: "t1",
			status: "in_progress",
		});
	});

	it("does not write for a card already in the column", () => {
		const { drop, update } = setup({
			tasks: [task("t1", "in_progress")],
		});

		drop("t1", "in_progress");

		expect(update).not.toHaveBeenCalled();
	});

	it("ignores a drop outside any column or on an unknown one, but still ends the group drag", () => {
		const { drop, update, overrides, options } = setup({
			tasks: [task("t1", "backlog")],
		});

		drop("t1", null);
		drop("t1", "somewhere-else");

		expect(update).not.toHaveBeenCalled();
		expect(overrides.statusOf(options.tasks[0])).toBe("backlog");
	});

	it("takes the card back and tells the user when the move is refused", async () => {
		const { drop, overrides, options } = setup({
			tasks: [task("t1", "backlog")],
			outcome: refused,
		});

		drop("t1", "in_progress");
		expect(overrides.statusOf(options.tasks[0])).toBe("in_progress");

		await vi.waitFor(() => {
			expect(overrides.statusOf(options.tasks[0])).toBe("backlog");
		});
		expect(toasterCreate).toHaveBeenCalledExactlyOnceWith({
			type: "error",
			title: "Not allowed.",
		});
	});

	it("celebrates a card landing in Done, and only then", async () => {
		const done = setup({ tasks: [task("t1", "backlog")] });
		done.drop("t1", "done");
		await vi.waitFor(() => {
			expect(celebrate).toHaveBeenCalledTimes(1);
		});
		disposeAll();
		celebrate.mockReset();

		const other = setup({ tasks: [task("t1", "backlog")] });
		other.drop("t1", "in_progress");
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(celebrate).not.toHaveBeenCalled();
	});
});
