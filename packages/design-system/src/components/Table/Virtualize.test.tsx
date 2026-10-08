import { render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

type Row = Record<string, unknown> & { id: string; group: string };

const columns: JfColumnDef<Row>[] = [
	{
		id: "group",
		header: "Group",
		dataType: "enum",
		enumOptions: [
			{ value: "a", label: "Group A" },
			{ value: "b", label: "Group B" },
		],
		accessorFn: (r) => r.group,
	},
	{ accessorKey: "id", header: "Id", dataType: "string" },
];

const SCROLL_PAST_END = 100_000;

function rows(n: number): Row[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `r${String(i)}`,
		group: i % 2 === 0 ? "a" : "b",
	}));
}

/**
 * Fires ResizeObserver callbacks by hand. jsdom has none of its own, so a test
 * that wants to model a tab hide/show cycle needs to trigger the observers the
 * component registers on the scroll parent — this collects each callback the
 * component installs and hands the test a `fire()` to invoke them.
 */
type ObservableStub = {
	fire: () => void;
	install: () => void;
	restore: () => void;
};

/**
 * A ResizeObserver stub that collects every callback the code under test
 * installs and lets a test invoke them by hand. Passes `[]` as the entries
 * array — the component's own RO callback ignores it (reads clientHeight
 * directly), while the virtualiser's internal ROs fall through their
 * `entries[0]?.borderBoxSize` fast path to a getRect(element) re-measure,
 * which is what a real hide/show notification would resolve to too.
 */
function observableStub(): ObservableStub {
	const callbacks = new Set<(entries: ResizeObserverEntry[]) => void>();
	class StubResizeObserver {
		#cb: (entries: ResizeObserverEntry[]) => void;
		constructor(cb: (entries: ResizeObserverEntry[]) => void) {
			this.#cb = cb;
			callbacks.add(cb);
		}
		observe() {
			/* the test drives measurement via fire() */
		}
		unobserve() {
			/* no-op */
		}
		disconnect() {
			callbacks.delete(this.#cb);
		}
	}
	return {
		install() {
			vi.stubGlobal("ResizeObserver", StubResizeObserver);
		},
		restore() {
			vi.unstubAllGlobals();
			callbacks.clear();
		},
		fire() {
			for (const cb of callbacks) cb([]);
		},
	};
}

/**
 * A scroll container the virtualiser can actually measure. jsdom performs no
 * layout, so every element reports zero height; both that and `ResizeObserver`
 * are supplied here. What this fakes is the browser's measurement, not the
 * component's arithmetic — the windowing decisions under test are still the
 * real ones. Height is settable so a test can simulate a hide/show cycle.
 */
function measurableScrollParent(initial: number) {
	const stub = observableStub();
	stub.install();
	let height = initial;
	function apply(el: HTMLDivElement, h: number) {
		height = h;
		for (const [prop, value] of [
			["clientHeight", h],
			// `offsetHeight`/`offsetWidth` are what the virtualiser seeds its
			// viewport from — the first being stubbed alone would produce an
			// empty table, which is exactly the bug the fallback guards against.
			["offsetHeight", h],
			["offsetWidth", 800],
		] as const) {
			Object.defineProperty(el, prop, { value, configurable: true });
		}
		el.getBoundingClientRect = () =>
			({ top: 0, left: 0, height: h, width: 800 }) as DOMRect;
	}
	let captured: HTMLDivElement | undefined;
	return {
		ref: (el: HTMLDivElement) => {
			captured = el;
			el.style.overflowY = "auto";
			apply(el, height);
		},
		/** Model a hide/show flip by setting the container's clientHeight and
		 *  firing the ResizeObserver the component installed on it. */
		resize(h: number) {
			if (!captured) throw new Error("scroll parent not captured yet");
			apply(captured, h);
			stub.fire();
		},
		/** Scroll the container to `top` and notify listeners, as a user
		 *  scroll would. */
		scrollTo(top: number) {
			if (!captured) throw new Error("scroll parent not captured yet");
			captured.scrollTop = top;
			captured.dispatchEvent(new Event("scroll"));
		},
		stub,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Table virtualisation", () => {
	it("renders every row when there is no scroll container to measure", () => {
		// The documented fallback. It applies only when there is no scroll
		// container at all — a table laid out somewhere with no scrollable
		// ancestor must show its rows rather than cull all of them against a
		// viewport it has no way to measure. A scroll container that merely
		// has not been given a height YET is a different case: it shows
		// skeleton rows instead (see "a table mounted hidden shows skeleton
		// rows until visible" below).
		render(() => (
			<Table.Root
				columns={columns}
				data={rows(40)}
				groupBy="group"
				virtualize
			/>
		));
		expect(screen.getByText("r0")).toBeInTheDocument();
		expect(screen.getByText("r39")).toBeInTheDocument();
	});

	it("renders only a window of rows when it can measure one", () => {
		const parent = measurableScrollParent(300);
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={rows(200)}
					groupBy="group"
					virtualize
				/>
			</div>
		));
		const rendered = document.querySelectorAll("tbody tr[data-index]");
		// A 300px viewport at ~53px a row plus overscan — the exact count is the
		// virtualiser's business, but it must be far short of 200, or nothing has
		// been saved.
		expect(rendered.length).toBeGreaterThan(0);
		expect(rendered.length).toBeLessThan(60);
	});

	it("reports every row to onDisplayedRowsChange, not just the rendered window", () => {
		// The property that makes virtualisation safe here. Drawer prev/next,
		// shift-click ranges and the batch action bar all walk this list; if it
		// shrank to the visible window, paging through the drawer would stop at
		// the bottom of the screen and a select-all would silently miss rows.
		const parent = measurableScrollParent(300);
		const seen: Row[][] = [];
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={rows(200)}
					groupBy="group"
					virtualize
					onDisplayedRowsChange={(r) => seen.push(r)}
				/>
			</div>
		));
		expect(seen.at(-1)).toHaveLength(200);
		// And in group order, so "next" in the drawer matches what the eye sees.
		expect(seen.at(-1)?.[0]?.group).toBe("a");
	});

	it("re-renders a windowed row when its data changes", () => {
		// The bug this pins: each virtual row was wrapped in a plain `Show`,
		// whose callback runs ONCE when the condition first turns truthy and
		// never again while it merely changes from one truthy value to another.
		// Rows rendered on first paint and then froze — a value changed on the
		// server, the query pushed a new row model, and the table went on
		// showing the old one. Only the virtualised tables were affected; the
		// plain path uses `For`, which re-renders on a new object.
		const parent = measurableScrollParent(300);
		const [data, setData] = createSignal<Row[]>([
			{ id: "before", group: "a" },
		]);
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={data()}
					groupBy="group"
					virtualize
				/>
			</div>
		));
		expect(screen.getByText("before")).toBeInTheDocument();

		setData([{ id: "after", group: "a" }]);
		expect(screen.getByText("after")).toBeInTheDocument();
		expect(screen.queryByText("before")).toBeNull();
	});

	it("leaves an ungrouped table alone", () => {
		const parent = measurableScrollParent(300);
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root columns={columns} data={rows(40)} virtualize />
			</div>
		));
		expect(screen.getByText("r39")).toBeInTheDocument();
	});

	it("a table mounted hidden shows skeleton rows until visible", async () => {
		// The tab-switch recovery. Ark's Tabs keep panels mounted between visits
		// and merely hide them, so a table mounted while hidden sees
		// clientHeight = 0. A scroll parent that has never had a height above 0
		// has nothing to window against, so — rather than rendering every row,
		// which is the cost this task removes — it shows skeleton rows until the
		// tab is actually shown. When the tab returns and clientHeight goes
		// non-zero, the component's ResizeObserver on the scroll parent fires;
		// the reactive `scrollParentHeight` signal flips `everVisible` true,
		// `virtualizing()` turns true, and the virtual window kicks in against
		// real measurements.
		const parent = measurableScrollParent(0);
		render(() => (
			<div ref={parent.ref} style={{ height: "0px" }}>
				<Table.Root
					columns={columns}
					data={rows(200)}
					groupBy="group"
					virtualize
				/>
			</div>
		));
		// Never visible: skeleton rows, not a full render.
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
		expect(document.querySelectorAll("tbody tr[data-index]").length).toBe(
			0
		);
		expect(screen.queryByText("r199")).toBeNull();

		// Panel becomes visible — fire the RO the component installed.
		parent.resize(300);
		await waitFor(() => {
			expect(
				document.querySelectorAll("[data-skeleton-row]").length
			).toBe(0);
			const rendered = document.querySelectorAll("tbody tr[data-index]");
			expect(rendered.length).toBeGreaterThan(0);
			expect(rendered.length).toBeLessThan(60);
		});
	});

	it("hiding a virtualised table after it has been visible freezes its window instead of rendering every row", async () => {
		// The bug this task fixes: a hidden tab's virtualised table used to fall
		// back to rendering EVERY row once its scroll parent's height dropped to
		// 0, because `virtualizing()` went false and the render-all fallback
		// kicked in. That is the exact cost a hidden panel should never pay.
		// Once the scroll parent has been visible, `virtualizing()` now stays
		// true and `VirtualBody` freezes its rendered window (same DOM nodes)
		// instead of recomputing against a zero-size viewport.
		const parent = measurableScrollParent(400);
		render(() => (
			<div ref={parent.ref} style={{ height: "400px" }}>
				<Table.Root
					columns={columns}
					data={rows(500)}
					groupBy="group"
					virtualize
				/>
			</div>
		));
		const before = [...document.querySelectorAll("tbody tr[data-index]")];
		expect(before.length).toBeGreaterThan(0);
		expect(before.length).toBeLessThan(100);

		parent.resize(0); // hidden tab

		// Assert immediately — the freeze must hold synchronously, not just
		// "eventually". A version that caches the virtualiser's live store
		// reference (rather than copying it) still passes a `waitFor`-only
		// assertion, because the collapse hasn't happened yet at that instant;
		// asserting right away, then again after flushing the microtask queue
		// the row `ref` callback schedules, is what catches it collapsing later.
		const immediatelyAfter = [
			...document.querySelectorAll("tbody tr[data-index]"),
		];
		expect(immediatelyAfter.length).toBe(before.length);
		expect(immediatelyAfter.every((tr, i) => tr === before[i])).toBe(true);

		await new Promise((r) => setTimeout(r, 0));
		const after = [...document.querySelectorAll("tbody tr[data-index]")];
		expect(after.length).toBe(before.length);
		expect(after.every((tr, i) => tr === before[i])).toBe(true); // same nodes
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
	});

	it("re-showing a hidden virtualised table re-windows instead of going blank", async () => {
		// The bug the re-show guard fixes: virtual-core's `calculateRange`
		// returns `[]` while the viewport's outerSize is 0, so the virtualiser's
		// own store sits empty for the whole time the table is hidden. On
		// return, Table's ResizeObserver can flip `hidden()` false before the
		// virtualiser has recomputed against the restored size, so a naive
		// "frozen only while hidden()" memo would read that stale empty store
		// within one synchronous observer delivery — every row unmounts, the spacers collapse to 0, and a
		// forced layout (the `scrollMargin` getter's `getBoundingClientRect`)
		// runs against a blank body. That must never happen: the table should
		// go straight from its frozen window to a freshly measured one.
		const parent = measurableScrollParent(400);
		render(() => (
			<div ref={parent.ref} style={{ height: "400px" }}>
				<Table.Root
					columns={columns}
					data={rows(500)}
					groupBy="group"
					virtualize
				/>
			</div>
		));
		const before = [...document.querySelectorAll("tbody tr[data-index]")];
		expect(before.length).toBeGreaterThan(0);
		expect(before.length).toBeLessThan(100);

		parent.resize(0); // hidden tab
		// A gap between hide and show, like a real tab switch — long enough for
		// the virtualiser's own deferred internal recompute (queued while
		// hidden) to land before the tab returns.
		await new Promise((r) => setTimeout(r, 0));
		parent.resize(400); // back to visible, same height as before

		// The window returns to the same rows it showed before hiding. If the
		// intermediate empty read was ever allowed through (even for one
		// synchronous instant, self-corrected before this line runs), `<For>`
		// would have unmounted every row and remounted fresh ones — so an
		// identity check catches what a row-count check alone would miss.
		const after = document.querySelectorAll("tbody tr[data-index]");
		expect(after.length).toBe(before.length);
		expect([...after].every((tr, i) => tr === before[i])).toBe(true);
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);

		await new Promise((r) => setTimeout(r, 0));
		const settled = document.querySelectorAll("tbody tr[data-index]");
		expect(settled.length).toBe(before.length);
		expect([...settled].every((tr, i) => tr === before[i])).toBe(true);
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
	});
});

describe("Table onEndReached", () => {
	it("fires once per row count when the rows do not fill the scroll box", async () => {
		const parent = measurableScrollParent(300);
		const onEndReached = vi.fn();
		const [data, setData] = createSignal(rows(4));
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={data()}
					groupBy="group"
					virtualize
					onEndReached={onEndReached}
				/>
			</div>
		));
		await waitFor(() => {
			expect(onEndReached).toHaveBeenCalledTimes(1);
		});

		// Same row count, new objects: a re-render alone does not re-fire.
		setData(rows(4));
		await new Promise((r) => setTimeout(r, 0));
		expect(onEndReached).toHaveBeenCalledTimes(1);

		// More rows that still do not fill the box: fires again.
		setData(rows(8));
		await waitFor(() => {
			expect(onEndReached).toHaveBeenCalledTimes(2);
		});
	});

	it("waits until the window nears the last row", async () => {
		const parent = measurableScrollParent(300);
		const onEndReached = vi.fn();
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={rows(200)}
					groupBy="group"
					virtualize
					onEndReached={onEndReached}
				/>
			</div>
		));
		await new Promise((r) => setTimeout(r, 0));
		expect(onEndReached).not.toHaveBeenCalled();

		parent.scrollTo(SCROLL_PAST_END);
		await waitFor(() => {
			expect(onEndReached).toHaveBeenCalledTimes(1);
		});
	});

	it("re-arms once the window leaves the end and returns", async () => {
		const parent = measurableScrollParent(300);
		const onEndReached = vi.fn();
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={rows(200)}
					groupBy="group"
					virtualize
					onEndReached={onEndReached}
				/>
			</div>
		));
		parent.scrollTo(SCROLL_PAST_END);
		await waitFor(() => {
			expect(onEndReached).toHaveBeenCalledTimes(1);
		});

		// Still at the end with the same rows: no second call.
		parent.scrollTo(SCROLL_PAST_END + 1);
		await new Promise((r) => setTimeout(r, 0));
		expect(onEndReached).toHaveBeenCalledTimes(1);

		parent.scrollTo(0);
		await new Promise((r) => setTimeout(r, 0));
		parent.scrollTo(SCROLL_PAST_END);
		await waitFor(() => {
			expect(onEndReached).toHaveBeenCalledTimes(2);
		});
	});

	it("does not fire while loading", async () => {
		const parent = measurableScrollParent(300);
		const onEndReached = vi.fn();
		render(() => (
			<div ref={parent.ref} style={{ height: "300px" }}>
				<Table.Root
					columns={columns}
					data={undefined}
					groupBy="group"
					virtualize
					onEndReached={onEndReached}
				/>
			</div>
		));
		await new Promise((r) => setTimeout(r, 0));
		expect(onEndReached).not.toHaveBeenCalled();
	});

	it("is not called on an unvirtualised table", async () => {
		const onEndReached = vi.fn();
		render(() => (
			<Table.Root
				columns={columns}
				data={rows(4)}
				groupBy="group"
				onEndReached={onEndReached}
			/>
		));
		await new Promise((r) => setTimeout(r, 0));
		expect(onEndReached).not.toHaveBeenCalled();
	});
});
