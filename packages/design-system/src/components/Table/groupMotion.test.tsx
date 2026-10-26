// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import {
	fakeViewTransitions,
	installViewTransitions,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { TABLE_ROW_CLIP_VAR } from "../../utils/morphNames.ts";
import {
	isTransitionRunning,
	viewTransition,
} from "../../utils/viewTransition.ts";

import { Table } from "./Table.tsx";
import { rowId } from "./testRowIds.ts";
import type { JfColumnDefinition } from "./types.ts";

type Row = { id: string; name: string; group: "a" | "b" };

const columns: JfColumnDefinition<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{
		accessorKey: "group",
		header: "Group",
		dataType: "enum",
		enumOptions: [
			{ value: "a", label: "A" },
			{ value: "b", label: "B" },
		],
	},
];

const data: Row[] = [
	{ id: "a1", name: "Ada", group: "a" },
	{ id: "a2", name: "Alan", group: "a" },
	{ id: "b1", name: "Barbara", group: "b" },
	{ id: "b2", name: "Brian", group: "b" },
];

const ALL_NAMES = [
	"jf-table-group-a",
	"jf-table-row-a1",
	"jf-table-row-a2",
	"jf-table-group-b",
	"jf-table-row-b1",
	"jf-table-row-b2",
];

const COLLAPSED_NAMES = [
	"jf-table-group-a",
	"jf-table-group-b",
	"jf-table-row-b1",
	"jf-table-row-b2",
];

/** The transition names the body's rows hold, in page order. */
function rowNames(): string[] {
	return [...document.querySelectorAll<HTMLElement>("tbody tr")]
		.map((row) => row.style.getPropertyValue("view-transition-name"))
		.filter(Boolean);
}

/** Records the row names in each snapshot, and the kinds of the
 *  transition. */
function recordSnapshots() {
	const seen: { old: string[]; new: string[]; kinds?: string } = {
		old: [],
		new: [],
	};
	const start = fakeViewTransitions({
		onStart: () => {
			seen.old = rowNames();
		},
		onSnapshot: () => {
			seen.new = rowNames();
			seen.kinds = document.documentElement.dataset.vt;
		},
	});
	return { start, seen };
}

function renderGrouped(rows: Row[] = data) {
	return render(() => (
		<Table.Root
			getRowId={rowId}
			columns={columns}
			data={rows}
			groupBy="group"
		/>
	));
}

function groupToggle(label: string): HTMLElement {
	return screen.getByRole("button", { name: new RegExp(`^${label} `) });
}

afterEach(() => {
	restoreViewTransitions();
});

test("collapsing a group names every row and header on screen in both snapshots, then clears them", async () => {
	const { start, seen } = recordSnapshots();
	renderGrouped();

	fireEvent.click(groupToggle("A"));
	await transitionSettled();

	expect(start).toHaveBeenCalledTimes(1);
	expect(seen.old).toEqual(ALL_NAMES);
	expect(seen.new).toEqual(COLLAPSED_NAMES);
	expect(seen.kinds?.split(" ")).toContain("table-collapse");
	expect(screen.queryByText("Ada")).not.toBeInTheDocument();
	expect(rowNames()).toEqual([]);
	expect(
		document.documentElement.style.getPropertyValue(TABLE_ROW_CLIP_VAR)
	).toBe("");
});

test("expanding a group names its rows in the new snapshot only", async () => {
	const { start, seen } = recordSnapshots();
	renderGrouped();
	fireEvent.click(groupToggle("A"));
	await transitionSettled();

	fireEvent.click(groupToggle("A"));
	await transitionSettled();

	expect(start).toHaveBeenCalledTimes(2);
	expect(seen.old).toEqual(COLLAPSED_NAMES);
	expect(seen.new).toEqual(ALL_NAMES);
	expect(seen.kinds?.split(" ")).toContain("table-expand");
	expect(seen.kinds?.split(" ")).not.toContain("table-collapse");
	expect(rowNames()).toEqual([]);
});

test("under reduced motion the toggle is immediate and starts no transition", () => {
	const start = vi.fn();
	installViewTransitions(start, { reducedMotion: true });
	renderGrouped();

	fireEvent.click(groupToggle("A"));

	expect(start).not.toHaveBeenCalled();
	expect(screen.queryByText("Ada")).not.toBeInTheDocument();
	expect(rowNames()).toEqual([]);
});

test("without the View Transitions API the toggle is immediate", () => {
	renderGrouped();

	fireEvent.click(groupToggle("A"));

	expect(screen.queryByText("Ada")).not.toBeInTheDocument();
	expect(rowNames()).toEqual([]);
});

test("while another transition runs (a morph animating) the toggle is immediate and starts none", async () => {
	const endings: (() => void)[] = [];
	const start = vi.fn((update: () => unknown) => {
		void Promise.resolve().then(update);
		return {
			finished: new Promise<void>((resolve) => {
				endings.push(resolve);
			}),
		};
	});
	installViewTransitions(start);
	const running = viewTransition(() => {});
	await vi.waitFor(() => {
		expect(isTransitionRunning()).toBe(false);
	});
	renderGrouped();

	fireEvent.click(groupToggle("A"));

	expect(start).toHaveBeenCalledTimes(1);
	expect(screen.queryByText("Ada")).not.toBeInTheDocument();
	expect(rowNames()).toEqual([]);
	for (const end of endings) end();
	await running;
});

test("rows off screen take no part", async () => {
	const { seen } = recordSnapshots();
	const far = 5000;
	const height = 40;
	// Every other element keeps happy-dom's empty box.
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			return this.dataset.morphOf?.startsWith("b")
				? new DOMRect(0, far, 0, height)
				: new DOMRect();
		}
	);
	renderGrouped();

	fireEvent.click(groupToggle("A"));
	await transitionSettled();

	expect(seen.old).toEqual([
		"jf-table-group-a",
		"jf-table-row-a1",
		"jf-table-row-a2",
		"jf-table-group-b",
	]);
	expect(seen.new).toEqual(["jf-table-group-a", "jf-table-group-b"]);
});

test("rows covered by something above them take no part; with none left the toggle is immediate", () => {
	const start = vi.fn();
	installViewTransitions(start);
	const cover = document.createElement("div");
	document.body.append(cover);
	Object.assign(document, { elementFromPoint: () => cover });
	renderGrouped();

	fireEvent.click(groupToggle("A"));

	expect(start).not.toHaveBeenCalled();
	expect(screen.queryByText("Ada")).not.toBeInTheDocument();
	Reflect.deleteProperty(document, "elementFromPoint");
	cover.remove();
});

test("a row covered in the old state stays out of the new one, where hit testing finds only <html>", async () => {
	const { seen } = recordSnapshots();
	const coveredTop = 100;
	const height = 40;
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			return this.dataset.morphOf === "a2"
				? new DOMRect(0, coveredTop, 0, height)
				: new DOMRect();
		}
	);
	const cover = document.createElement("div");
	document.body.append(cover);
	// As Chrome does: while an update runs, every point hits <html>.
	Object.assign(document, {
		elementFromPoint: (_x: number, y: number) => {
			if (isTransitionRunning()) return document.documentElement;
			return y >= coveredTop ? cover : null;
		},
	});
	renderGrouped();

	fireEvent.click(groupToggle("B"));
	await transitionSettled();

	expect(seen.old).toEqual(
		ALL_NAMES.filter((name) => name !== "jf-table-row-a2")
	);
	expect(seen.new).toEqual([
		"jf-table-group-a",
		"jf-table-row-a1",
		"jf-table-group-b",
	]);
	Reflect.deleteProperty(document, "elementFromPoint");
	cover.remove();
});

const WINDOWED_ROWS = 200;
const VIEWPORT_HEIGHT = 300;
const VIEWPORT_WIDTH = 800;

/** A scroll parent the virtualiser can measure (happy-dom lays nothing
 *  out). */
function measurableParent(element: HTMLDivElement): void {
	element.style.overflowY = "auto";
	for (const [property, value] of [
		["clientHeight", VIEWPORT_HEIGHT],
		["offsetHeight", VIEWPORT_HEIGHT],
		["offsetWidth", VIEWPORT_WIDTH],
	] as const) {
		Object.defineProperty(element, property, { value, configurable: true });
	}
}

test("a virtualised table names only the rows it renders", async () => {
	const { start, seen } = recordSnapshots();
	const rows = Array.from({ length: WINDOWED_ROWS }, (_, index) => ({
		id: `r${String(index)}`,
		name: `Row ${String(index)}`,
		group: index < WINDOWED_ROWS / 2 ? ("a" as const) : ("b" as const),
	}));
	render(() => (
		<div ref={measurableParent}>
			<Table.Root
				getRowId={rowId}
				columns={columns}
				data={rows}
				groupBy="group"
				virtualize
			/>
		</div>
	));
	const rendered = document.querySelectorAll("tbody tr[data-index]").length;
	expect(rendered).toBeLessThan(WINDOWED_ROWS / 2);

	fireEvent.click(groupToggle("A"));
	await transitionSettled();

	expect(start).toHaveBeenCalledTimes(1);
	expect(seen.old).toHaveLength(rendered);
	expect(new Set(seen.old).size).toBe(rendered);
	expect(seen.new).toContain("jf-table-group-a");
	expect(seen.new).toContain("jf-table-group-b");
	expect(new Set(seen.new).size).toBe(seen.new.length);
	expect(rowNames()).toEqual([]);
});
