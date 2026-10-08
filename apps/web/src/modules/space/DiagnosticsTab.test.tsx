// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { getFunctionName } from "convex/server";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";

import { DOOR_LOG_PAGE_SIZE } from "../../../convex/lib/constants.ts";

const health: { value: unknown } = {
	value: {
		configured: 2,
		unavailable: [{ name: "Upstairs" }],
		locks: [
			{ name: "Downstairs", online: true },
			{ name: "Upstairs", online: false },
		],
	},
};

type Row = {
	_id: string;
	at: number;
	name: string;
	operation: string;
	trigger: string;
	lockNames: string[];
	outcome: string;
	detail?: string;
	actuation?: string;
	requestedAt?: number;
	actuatedAt?: number;
};

const NOW = new Date(2026, 9, 4, 12, 0).getTime();
function at(daysAgo: number, hour = 9): number {
	return new Date(2026, 9, 4 - daysAgo, hour, 0).getTime();
}

function row(id: string, when: number, name = id, extra: Partial<Row> = {}) {
	return {
		_id: id,
		at: when,
		name,
		operation: "grant",
		trigger: "onboarding",
		lockNames: ["Downstairs"],
		outcome: "ok",
		...extra,
	};
}

type State = {
	head: unknown;
	headError: Error | undefined;
	floor: { since: number | null };
	floorError: boolean;
	floorGate: Promise<void> | undefined;
	listBefore: Mock<(args: unknown) => Promise<unknown>>;
	headArgs: unknown[];
};

const state = vi.hoisted(
	(): State => ({
		head: undefined,
		headError: undefined,
		floor: { since: 1000 },
		floorError: false,
		floorGate: undefined,
		listBefore: vi.fn(),
		headArgs: [],
	})
);

/** The `onEndReached` and `columns` the tab handed the Table, so a test can
 *  fire the one and read the other. */
const table = vi.hoisted(() => ({
	onEndReached: undefined as (() => void) | undefined,
	columns: [] as unknown[],
}));

vi.mock("@j-os/design-system", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@j-os/design-system")>();
	type RootProps = Parameters<typeof actual.Table.Root>[0];
	return {
		...actual,
		Table: {
			...actual.Table,
			Root: (props: RootProps) => {
				// eslint-disable-next-line solid/reactivity -- test double: hands the live prop to the test, which calls it
				table.onEndReached = () => props.onEndReached?.();
				// eslint-disable-next-line solid/reactivity -- test double: the columns are static config, read once
				table.columns = props.columns;
				return actual.Table.Root(props);
			},
		},
	};
});

vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync: () => Promise.resolve(health.value) }),
	useQuery: (
		_ref: unknown,
		args: () => unknown,
		options?: () => { enabled?: boolean }
	) => ({
		data: () => {
			if (options?.().enabled === false) return undefined;
			state.headArgs.push(args());
			return state.head;
		},
		isLoading: () => false,
		error: () => state.headError,
	}),
	useConvexClient: () => ({
		query: async (
			ref: Parameters<typeof getFunctionName>[0],
			args: unknown
		) => {
			const name = getFunctionName(ref);
			if (name === "doorLog:firstPageFloor") {
				await state.floorGate;
				if (state.floorError) throw new Error("boom");
				return state.floor;
			}
			if (name === "doorLog:listBefore") return state.listBefore(args);
			throw new Error(`unexpected ${name}`);
		},
	}),
}));

import { DiagnosticsTab } from "./DiagnosticsTab.tsx";

const [headSignal, setHeadSignal] = createSignal<unknown>([]);
Object.defineProperty(state, "head", { get: headSignal, set: setHeadSignal });

/** Hold the floor query until the returned function is called. */
function gateFloor(): () => void {
	const gate: { open?: () => void } = {};
	state.floorGate = new Promise<void>((resolve) => {
		gate.open = resolve;
	});
	return () => {
		gate.open?.();
	};
}

function endReached() {
	table.onEndReached?.();
}

function page(rows: Row[], continueCursor: string, isDone: boolean) {
	return { page: rows, continueCursor, isDone };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	state.head = [];
	state.headError = undefined;
	state.floor = { since: 1000 };
	state.floorError = false;
	state.floorGate = undefined;
	state.listBefore = vi.fn();
	state.headArgs = [];
	table.onEndReached = undefined;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

async function mounted() {
	const view = render(() => <DiagnosticsTab />);
	// The floor has resolved once the head query is enabled and read.
	await waitFor(() => {
		expect(state.headArgs.length).toBeGreaterThan(0);
	});
	expect(table.onEndReached).toBeDefined();
	return view;
}

test("renders per-lock health and log rows", async () => {
	state.head = [
		row("a", at(0), "Ada Lovelace", {
			lockNames: ["Downstairs", "Upstairs"],
		}),
	];
	render(() => <DiagnosticsTab />);
	expect(await screen.findByText("Downstairs online")).toBeInTheDocument();
	expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
	expect(screen.getByText("Grant")).toBeInTheDocument();
	expect(screen.getByText("Downstairs, Upstairs")).toBeInTheDocument();
});

test("shows how long the door took to react, and No response in the warning colour", async () => {
	state.head = [
		row("a", at(0, 10), "Ada A", {
			operation: "unlock",
			trigger: "app",
			actuation: "actuated",
			requestedAt: at(0, 10),
			actuatedAt: at(0, 10) + 2400,
		}),
		row("b", at(0, 9), "Bea B", {
			operation: "unlock",
			trigger: "app",
			actuation: "unconfirmed",
			requestedAt: at(0, 9),
		}),
		row("c", at(0, 8), "Cy C"),
	];
	render(() => <DiagnosticsTab />);
	expect(await screen.findByText("To door")).toBeInTheDocument();
	const took = await screen.findByText("2.4s");
	expect(took.className).not.toMatch(/noResponse/);
	const none = screen.getByText("No response");
	expect(none.className).toMatch(/noResponse/);
});

test("groups rows under Today, Yesterday and dated headers, newest first", async () => {
	state.head = [
		row("a", at(0), "Ada A"),
		row("b", at(1), "Bea B"),
		row("c", at(5), "Cy C"),
	];
	render(() => <DiagnosticsTab />);
	await screen.findByText("Ada A");
	const text = document.body.textContent;
	const today = text.indexOf("Today");
	const yesterday = text.indexOf("Yesterday");
	const dated = text.indexOf(
		new Date(at(5)).toLocaleDateString(undefined, { dateStyle: "medium" })
	);
	expect(today).toBeGreaterThan(-1);
	expect(yesterday).toBeGreaterThan(today);
	expect(dated).toBeGreaterThan(yesterday);
	expect(text.indexOf("Ada A")).toBeLessThan(text.indexOf("Bea B"));
	expect(text.indexOf("Bea B")).toBeLessThan(text.indexOf("Cy C"));
});

test("shows an empty state when the log has no rows", async () => {
	state.head = [];
	state.floor = { since: null };
	render(() => <DiagnosticsTab />);
	expect(
		await screen.findByText("No door operations recorded yet.")
	).toBeInTheDocument();
});

test("shows a skeleton, not a crash, while the log query is still loading", async () => {
	// Regression: a prod crash ("Cannot read properties of undefined (reading
	// 'map')") shipped when the rows were mapped before the query resolved.
	state.head = undefined;
	render(() => <DiagnosticsTab />);
	expect(await screen.findByText("Door log")).toBeInTheDocument();
	expect(
		document.querySelectorAll("[data-skeleton-row]").length
	).toBeGreaterThan(0);
	expect(
		screen.queryByText("No door operations recorded yet.")
	).not.toBeInTheDocument();
});

test("shows an error state when the log query fails", async () => {
	state.head = undefined;
	state.headError = new Error("boom");
	render(() => <DiagnosticsTab />);
	expect(
		await screen.findByText("Couldn't load the log.")
	).toBeInTheDocument();
	expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
});

test("shows an error state when the floor query fails", async () => {
	state.head = undefined;
	state.floorError = true;
	render(() => <DiagnosticsTab />);
	expect(
		await screen.findByText("Couldn't load the log.")
	).toBeInTheDocument();
});

test("labels a log-only GC row as a dry run, not as a revoke that happened", async () => {
	state.head = [
		row("g", at(0), "Ghost G", {
			operation: "revoke",
			trigger: "gc",
			lockNames: ["J Floor City - Upstairs"],
			outcome: "dry-run",
			detail: "log-only",
		}),
	];
	render(() => <DiagnosticsTab />);
	expect(await screen.findByText("Ghost G")).toBeInTheDocument();
	expect(screen.getByText("Dry run")).toBeInTheDocument();
	expect(screen.queryByText("Ok")).not.toBeInTheDocument();
});

test("renders an app lock row with its lock operation", async () => {
	state.head = [
		row("l", at(0), "Bo Ard", {
			operation: "lock",
			trigger: "app",
			lockNames: ["J Floor City - Upstairs"],
		}),
	];
	render(() => <DiagnosticsTab />);
	expect(await screen.findByText("Bo Ard")).toBeInTheDocument();
	expect(screen.getByText("Lock")).toBeInTheDocument();
});

test("reaching the end loads the first older chunk after the head, from the floor", async () => {
	state.head = [row("a", at(0), "Ada A")];
	state.listBefore.mockResolvedValue(
		page([row("o1", at(3), "Old One")], "c1", false)
	);
	await mounted();
	endReached();
	expect(await screen.findByText("Old One")).toBeInTheDocument();
	expect(state.listBefore).toHaveBeenCalledTimes(1);
	expect(state.listBefore).toHaveBeenCalledWith({
		before: 1000,
		paginationOpts: { numItems: DOOR_LOG_PAGE_SIZE, cursor: null },
	});
	const text = document.body.textContent;
	expect(text.indexOf("Ada A")).toBeLessThan(text.indexOf("Old One"));
});

test("the next end reached continues from the cursor and stops once done", async () => {
	state.head = [row("a", at(0), "Ada A")];
	state.listBefore
		.mockResolvedValueOnce(page([row("o1", at(3), "Old One")], "c1", false))
		.mockResolvedValueOnce(page([row("o2", at(4), "Old Two")], "c2", true));
	await mounted();
	endReached();
	await screen.findByText("Old One");
	endReached();
	await screen.findByText("Old Two");
	expect(state.listBefore).toHaveBeenLastCalledWith({
		before: 1000,
		paginationOpts: { numItems: DOOR_LOG_PAGE_SIZE, cursor: "c1" },
	});
	endReached();
	endReached();
	expect(state.listBefore).toHaveBeenCalledTimes(2);
});

test("two end-reached calls while a load is pending make one call", async () => {
	state.head = [row("a", at(0), "Ada A")];
	const gate: { release?: (value: unknown) => void } = {};
	state.listBefore.mockReturnValue(
		new Promise((resolve) => {
			gate.release = resolve;
		})
	);
	await mounted();
	endReached();
	endReached();
	expect(state.listBefore).toHaveBeenCalledTimes(1);
	expect(
		await screen.findByText("Loading older entries…")
	).toBeInTheDocument();
	gate.release?.(page([], "c1", true));
	await waitFor(() => {
		expect(
			screen.queryByText("Loading older entries…")
		).not.toBeInTheDocument();
	});
});

test("a null floor never loads older rows", async () => {
	state.head = [row("a", at(0), "Ada A")];
	state.floor = { since: null };
	await mounted();
	endReached();
	endReached();
	expect(state.listBefore).not.toHaveBeenCalled();
});

test("a new head row appears on top and a row in both lists renders once", async () => {
	state.head = [row("dup", at(0), "Dup D")];
	state.listBefore.mockResolvedValue(
		page(
			[row("dup", at(0), "Dup D"), row("o1", at(3), "Old One")],
			"c1",
			true
		)
	);
	await mounted();
	endReached();
	await screen.findByText("Old One");
	expect(screen.getAllByText("Dup D")).toHaveLength(1);
	state.head = [
		row("new", at(0, 11), "Newest N"),
		row("dup", at(0), "Dup D"),
	];
	await screen.findByText("Newest N");
	expect(screen.getAllByText("Dup D")).toHaveLength(1);
	const text = document.body.textContent;
	expect(text.indexOf("Newest N")).toBeLessThan(text.indexOf("Dup D"));
});

test("a failed older load says so quietly and the next end reached retries", async () => {
	state.head = [row("a", at(0), "Ada A")];
	state.listBefore
		.mockRejectedValueOnce(new Error("boom"))
		.mockResolvedValueOnce(page([row("o1", at(3), "Old One")], "c1", true));
	await mounted();
	endReached();
	expect(
		await screen.findByText("Couldn't load older entries.")
	).toBeInTheDocument();
	endReached();
	expect(await screen.findByText("Old One")).toBeInTheDocument();
	expect(state.listBefore).toHaveBeenCalledTimes(2);
	expect(state.listBefore).toHaveBeenLastCalledWith({
		before: 1000,
		paginationOpts: { numItems: DOOR_LOG_PAGE_SIZE, cursor: null },
	});
	expect(
		screen.queryByText("Couldn't load older entries.")
	).not.toBeInTheDocument();
});

test("the head waits for the floor, then reads from it", async () => {
	state.head = [row("a", at(0), "Ada A")];
	const open = gateFloor();
	render(() => <DiagnosticsTab />);
	await screen.findByText("Door log");
	expect(screen.queryByText("Ada A")).not.toBeInTheDocument();
	expect(state.headArgs).toEqual([]);
	open();
	expect(await screen.findByText("Ada A")).toBeInTheDocument();
	expect(state.headArgs.at(-1)).toEqual({ since: 1000 });
});

test("an end reached before the floor resolves loads once it does", async () => {
	state.head = [row("a", at(0), "Ada A")];
	state.listBefore.mockResolvedValue(
		page([row("o1", at(3), "Old One")], "c1", true)
	);
	const open = gateFloor();
	render(() => <DiagnosticsTab />);
	await waitFor(() => {
		expect(table.onEndReached).toBeDefined();
	});
	endReached();
	expect(state.listBefore).not.toHaveBeenCalled();
	open();
	expect(await screen.findByText("Old One")).toBeInTheDocument();
	expect(state.listBefore).toHaveBeenCalledTimes(1);
	expect(state.listBefore).toHaveBeenCalledWith({
		before: 1000,
		paginationOpts: { numItems: DOOR_LOG_PAGE_SIZE, cursor: null },
	});
});

test("nothing loads after the tab unmounts", async () => {
	const open = gateFloor();
	const view = render(() => <DiagnosticsTab />);
	await waitFor(() => {
		expect(table.onEndReached).toBeDefined();
	});
	endReached();
	view.unmount();
	open();
	await new Promise((r) => setTimeout(r, 0));
	endReached();
	expect(state.listBefore).not.toHaveBeenCalled();
});

type LogColumn = {
	id?: string;
	accessorKey?: string;
	size?: unknown;
	measureText?: (row: Record<string, unknown>) => string;
};

test("the log's columns fit their content and leave the rest to Person and Locks", async () => {
	await mounted();
	const columns = new Map(
		(table.columns as LogColumn[]).map((c) => [c.id ?? c.accessorKey, c])
	);
	expect(
		Object.fromEntries([...columns].map(([id, c]) => [id, c.size]))
	).toEqual({
		day: undefined,
		at: "content",
		person: undefined,
		operation: "content",
		trigger: "content",
		locks: { min: "content", weight: 2 },
		outcome: "content",
		toDoor: "content",
	});
	const when = at(0);
	expect(columns.get("at")?.measureText?.({ at: when })).toBe(
		new Date(when).toLocaleTimeString(undefined, { timeStyle: "short" })
	);
	// No override: the default measures the accessor value, the same string the
	// cell shows.
	expect(columns.get("toDoor")?.measureText).toBeUndefined();
});
