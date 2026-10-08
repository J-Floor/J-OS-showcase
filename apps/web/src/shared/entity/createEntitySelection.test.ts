// @vitest-environment happy-dom
/* eslint-disable solid/reactivity -- this is a headless-hook harness, not a
   component: signal accessors (`rows`) are passed straight through to
   `createEntitySelection`'s `rows` option, which reads them inside its own
   effects. There is no JSX or event handler here for the plugin to recognise
   as a tracked scope. */
import {
	MemoryRouter,
	Router,
	createMemoryHistory,
	useLocation,
	useNavigate,
	useSearchParams,
} from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createComponent, createEffect, createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";

import { createEntitySelection } from "./createEntitySelection.ts";

afterEach(cleanup);

type Row = {
	_id: string;
	tag?: string;
};

const rowA: Row = { _id: "a1" };
const rowB: Row = { _id: "b1" };

// createEntitySelection calls useSearchParams, which needs Router context. This
// file is `.ts`, not `.tsx` (matches createEntitySelection.ts, the hook it
// specs), so the harness below never uses JSX — it composes Router/Route via
// their plain-object config API (createComponent + a RouteDefinition), and
// captures the hook's return value into `bag.sel` instead of rendering markup
// and driving it through simulated clicks.
//
// `bag.search` mirrors `useLocation().search` — solid-router's own
// `MemoryHistory.get()` does not reliably reflect a `setSearchParams` write in
// this harness (its navigation goes through `startTransition`), so URL
// assertions read the router's canonical reactive location instead.
type Bag = {
	sel?: ReturnType<typeof createEntitySelection<Row>>;
	search?: () => string;
	pathname?: () => string;
};

function renderHarness(
	rows: () => Row[] | undefined,
	options?: {
		history?: ReturnType<typeof createMemoryHistory>;
		param?: string;
		slugOf?: (row: Row) => string;
	}
): Bag {
	const bag: Bag = {};
	const param = options?.param ?? "x";
	function Harness() {
		bag.sel = createEntitySelection<Row>({
			rows,
			param,
			slugOf: options?.slugOf,
		});
		const location = useLocation();
		bag.search = () => location.search;
		bag.pathname = () => location.pathname;
		return undefined;
	}
	render(() =>
		createComponent(MemoryRouter, {
			history: options?.history ?? createMemoryHistory(),
			children: { path: "*", component: Harness },
		})
	);
	return bag;
}

test("inbound ?x=id opens optimistically before rows load, resolves once they arrive", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/anything?x=a1", replace: true });
	const bag = renderHarness(rows, { history });

	// Rows haven't loaded yet — opens immediately anyway; the drawer shows a
	// skeleton (selected() undefined) instead of flashing the create form.
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");
	expect(bag.sel?.selected()).toBeUndefined();

	setRows([rowA]);
	await waitFor(() => {
		expect(bag.sel?.selected()).toEqual(rowA);
	});
});

test("close clears open and selectedId and removes the param (replace:true)", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const bag = renderHarness(rows);

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
	await waitFor(() => {
		expect(bag.search?.()).not.toContain("x=");
	});
});

test("re-selecting the same id after close re-opens it (bug #60 regression)", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA]);
	// A base entry to be on: close() pops the entry the open pushed (as in the
	// real app, where the drawer always opens from some page).
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	// Wait for the open's URL push to settle before closing — close() pops that
	// entry, so it must exist first (a real open→close always spans a tick).
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});
	expect(bag.sel?.open()).toBe(true);

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});

	// The regression: close() must clear selectedId, not just the URL param —
	// otherwise the inbound-param effect sees selectedId() === wanted and skips
	// reopening.
	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");
});

test("closes when the open row vanishes from the live list", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	// Let the open settle (URL pushed) before the row vanishes — the drawer was
	// genuinely open and on screen, then the row is deleted.
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});
	expect(bag.sel?.open()).toBe(true);

	setRows([rowB]);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
});

test("openCreate opens the create form with the reserved ?x=new sentinel", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const bag = renderHarness(rows);

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});

	bag.sel?.openCreate();
	await waitFor(() => {
		expect(bag.sel?.selectedId()).toBeUndefined();
	});
	expect(bag.sel?.open()).toBe(true);
	// `selected()` stays undefined (the sentinel matches no row), so the drawer
	// renders the create form. The param is the `new` sentinel — create is now
	// URL-linked so the Back button can close it (not a row id, though).
	expect(bag.sel?.selected()).toBeUndefined();
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=new");
	});
});

test("reopening the same row via an inbound nav after close works (command-palette reopen)", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	// Command palette opens a row by navigating to its URL (a push).
	history.set({ value: "/events?x=a1" });
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	// close() must clear selectedId (not just the URL), or the inbound effect
	// sees selectedId === wanted and refuses to reopen the same row.
	expect(bag.sel?.selectedId()).toBeUndefined();
	// Let the close's URL write settle (a real reopen is seconds later).
	await waitFor(() => {
		expect(bag.search?.()).not.toContain("x=a1");
	});

	// Palette navigates to the same URL again — the drawer must reopen.
	history.set({ value: "/events?x=a1" });
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");
});

test("system Back closes the drawer and stays on the page", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});
	expect(bag.sel?.open()).toBe(true);

	// The system/browser Back button: pop the entry the open pushed.
	history.back();

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
	expect(bag.search?.()).not.toContain("x=");
	// Still on the same page — Back closed the drawer, it did not navigate away.
	expect(bag.pathname?.()).toBe("/events");
});

test("stepping row→row does not stack history: one Back closes to the page", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});
	// Step to another row while the drawer is open — must REPLACE, not push.
	bag.sel?.openRow(rowB);
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=b1");
	});

	// One Back returns to the page with the drawer closed — NOT to rowA (which
	// would prove stepping stacked an extra entry).
	history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.search?.()).not.toContain("x=");
	expect(bag.pathname?.()).toBe("/events");
});

test("close(false) clears in place without popping history (programmatic close during another nav)", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/inventory?tab=items", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});

	// A tab switch closes the drawer and then writes its own new URL — a
	// history traversal here would race that write. close(false) must only
	// clear state + param in place, leaving the current entry (and its `tab`)
	// intact rather than navigating back.
	bag.sel?.close(false);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.search?.()).not.toContain("x=a1");
	expect(bag.search?.()).toContain("tab=items");
	expect(bag.pathname?.()).toBe("/inventory");
});

test("close() consumes the pushed entry (pops history), staying on the page", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=a1");
	});

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.search?.()).not.toContain("x=");
	expect(bag.pathname?.()).toBe("/events");
});

test("a deep-linked drawer closes in place without leaving the app", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	// Cold landing directly on the deep link — the hook pushed no entry.
	history.set({ value: "/events?x=a1", replace: true });
	const bag = renderHarness(rows, { history });

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
	expect(bag.search?.()).not.toContain("x=");
	// Closed in place: still on the events page, not navigated out of the app.
	expect(bag.pathname?.()).toBe("/events");
});

test("Back closes a drawer reached by navigating in from another page, staying on the list", async () => {
	// Cold-inbound synthesis rewrites the real `window.history`, so this one
	// runs under the window-bound Router (jsdom implements History).
	window.history.replaceState(null, "", "/home");
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const bag: Bag & { navigate?: ReturnType<typeof useNavigate> } = {};
	function Harness() {
		bag.sel = createEntitySelection<Row>({ rows, param: "x" });
		bag.navigate = useNavigate();
		const location = useLocation();
		bag.search = () => location.search;
		bag.pathname = () => location.pathname;
		return undefined;
	}
	render(() =>
		createComponent(Router, {
			children: { path: "*", component: Harness },
		})
	);

	// What a command-palette pick does: a plain router navigation.
	bag.navigate?.("/events?x=a1");
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	await waitFor(() => {
		expect(window.location.search).toBe("?x=a1");
	});

	window.history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.pathname?.()).toBe("/events");
	expect(window.location.pathname).toBe("/events");

	// Picking the same row again reopens it, and Back closes it again.
	bag.navigate?.("/events?x=a1");
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	await waitFor(() => {
		expect(window.location.search).toBe("?x=a1");
	});
	window.history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(window.location.pathname).toBe("/events");
});

test("navigating in from the same list adds no duplicate list entry: one Back closes, the next leaves", async () => {
	window.history.replaceState(null, "", "/home");
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const bag: Bag & { navigate?: ReturnType<typeof useNavigate> } = {};
	function Harness() {
		bag.sel = createEntitySelection<Row>({ rows, param: "x" });
		bag.navigate = useNavigate();
		const location = useLocation();
		bag.pathname = () => location.pathname;
		return undefined;
	}
	render(() =>
		createComponent(Router, {
			children: { path: "*", component: Harness },
		})
	);

	bag.navigate?.("/events");
	await waitFor(() => {
		expect(window.location.pathname).toBe("/events");
	});
	// A command-palette pick while already on the list.
	bag.navigate?.("/events?x=a1");
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	await waitFor(() => {
		expect(window.location.search).toBe("?x=a1");
	});

	window.history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(window.location.pathname).toBe("/events");

	window.history.back();
	await waitFor(() => {
		expect(window.location.pathname).toBe("/home");
	});
});

test("a same-list pick stays one Back deep even when the page rewrites another param as it opens", async () => {
	window.history.replaceState(null, "", "/home");
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const bag: Bag & { navigate?: ReturnType<typeof useNavigate> } = {};
	function Harness() {
		bag.sel = createEntitySelection<Row>({ rows, param: "x" });
		bag.navigate = useNavigate();
		const [params, setParams] = useSearchParams();
		// What Community's tab-follow does: once the drawer opens, put the
		// row's tab in the URL with `replace`.
		createEffect(() => {
			if (bag.sel?.selectedId() !== undefined && params.tab !== "t2")
				setParams({ tab: "t2" }, { replace: true });
		});
		return undefined;
	}
	render(() =>
		createComponent(Router, {
			children: { path: "*", component: Harness },
		})
	);

	bag.navigate?.("/events");
	await waitFor(() => {
		expect(window.location.pathname).toBe("/events");
	});
	bag.navigate?.("/events?x=a1");
	await waitFor(() => {
		expect(window.location.search).toContain("tab=t2");
	});
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});

	window.history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(window.location.pathname).toBe("/events");

	window.history.back();
	await waitFor(() => {
		expect(window.location.pathname).toBe("/home");
	});
});

test("Back closes the create drawer opened via openCreate", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openCreate();
	await waitFor(() => {
		expect(bag.search?.()).toContain("x=new");
	});
	expect(bag.sel?.open()).toBe(true);

	history.back();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.search?.()).not.toContain("x=");
	expect(bag.pathname?.()).toBe("/events");
});

test("a custom slugOf, not _id, drives the inbound match, selected(), and close-on-vanish", async () => {
	const tagged: Row = { _id: "id1", tag: "TAG-1" };
	const [rows, setRows] = createSignal<Row[] | undefined>([tagged]);
	const history = createMemoryHistory();
	history.set({ value: "/anything?x=TAG-1", replace: true });
	const bag = renderHarness(rows, {
		history,
		slugOf: (row) => row.tag ?? row._id,
	});

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("TAG-1");
	expect(bag.sel?.selected()?._id).toBe("id1");

	setRows([]);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
});

test("openRow opens immediately before rows load; selected() fills in when they arrive", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	bag.sel?.openRow(rowA);
	// Open now, even though rows are still loading.
	expect(bag.sel?.open()).toBe(true);
	expect(bag.sel?.selectedId()).toBe("a1");
	expect(bag.sel?.selected()).toBeUndefined();

	setRows([rowA, rowB]);
	await waitFor(() => {
		expect(bag.sel?.selected()).toEqual(rowA);
	});
});

test("a cold inbound ?x=a1 opens loading before rows, resolves when they load", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/events?x=a1", replace: true });
	const bag = renderHarness(rows, { history });

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");
	expect(bag.sel?.selected()).toBeUndefined();

	setRows([rowA, rowB]);
	await waitFor(() => {
		expect(bag.sel?.selected()).toEqual(rowA);
	});
});

test("optimistically-opened drawer closes if the loaded list turns out to lack the id (dead link)", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/events?x=a1", replace: true });
	const bag = renderHarness(rows, { history });

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selected()).toBeUndefined();

	// Rows load, but the requested id was never there (bad link, or deleted
	// before it loaded) — the optimistic open must retract.
	setRows([rowB]);
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});
	expect(bag.sel?.selectedId()).toBeUndefined();
	await waitFor(() => {
		expect(bag.search?.()).not.toContain("x=a1");
	});
});

test("a dead deep-link with rows already loaded at mount clears the stale param and opens no drawer", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	// Rows are loaded (not undefined) from the very first render — the
	// LOADED-but-absent branch, not the still-loading optimistic-open one.
	history.set({ value: "/events?x=missing", replace: true });
	const bag = renderHarness(rows, { history });

	await waitFor(() => {
		expect(bag.search?.()).not.toContain("x=missing");
	});
	expect(bag.sel?.open()).toBe(false);
	expect(bag.sel?.selectedId()).toBeUndefined();
});

test("a valid deep-link with rows already loaded at mount still opens", async () => {
	const [rows] = createSignal<Row[] | undefined>([rowA, rowB]);
	const history = createMemoryHistory();
	history.set({ value: "/events?x=a1", replace: true });
	const bag = renderHarness(rows, { history });

	await waitFor(() => {
		expect(bag.sel?.open()).toBe(true);
	});
	expect(bag.sel?.selectedId()).toBe("a1");
	expect(bag.sel?.selected()).toEqual(rowA);
	expect(bag.search?.()).toContain("x=a1");
});

test("loading() is true only while a real row is selected but not yet resolved; creating() only in the open create form", async () => {
	const [rows, setRows] = createSignal<Row[] | undefined>(undefined);
	const history = createMemoryHistory();
	history.set({ value: "/events", replace: true });
	const bag = renderHarness(rows, { history });

	// Nothing open yet: neither loading nor creating.
	expect(bag.sel?.loading()).toBe(false);
	expect(bag.sel?.creating()).toBe(false);

	// A real row opened optimistically before rows arrive: loading, not
	// creating.
	bag.sel?.openRow(rowA);
	expect(bag.sel?.loading()).toBe(true);
	expect(bag.sel?.creating()).toBe(false);

	// Rows arrive and resolve the row: loading clears.
	setRows([rowA, rowB]);
	await waitFor(() => {
		expect(bag.sel?.selected()).toEqual(rowA);
	});
	expect(bag.sel?.loading()).toBe(false);
	expect(bag.sel?.creating()).toBe(false);

	bag.sel?.close();
	await waitFor(() => {
		expect(bag.sel?.open()).toBe(false);
	});

	// The create form: creating, never loading (there is no slug to resolve).
	bag.sel?.openCreate();
	expect(bag.sel?.creating()).toBe(true);
	expect(bag.sel?.loading()).toBe(false);
});
