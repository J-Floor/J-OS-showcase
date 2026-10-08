// @vitest-environment happy-dom
import { waitFor } from "@solidjs/testing-library";
import { createRoot, createSignal } from "solid-js";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type Mock,
} from "vitest";

type Row = { _id: string; at: number };

type State = {
	floor: { since: number | null };
	floorFailures: number;
	floorCalls: number;
	floorGate: Promise<void> | undefined;
	headError: Error | undefined;
	listBefore: Mock<(args: unknown) => Promise<unknown>>;
	headArgs: unknown[];
};

const state = vi.hoisted(
	(): State => ({
		floor: { since: 100 },
		floorFailures: 0,
		floorCalls: 0,
		floorGate: undefined,
		headError: undefined,
		listBefore: vi.fn(),
		headArgs: [],
	})
);

const [head, setHead] = createSignal<Row[] | undefined>([]);

vi.mock("convex-solidjs", () => ({
	useQuery: (
		_ref: unknown,
		args: () => unknown,
		options: () => { enabled: boolean }
	) => ({
		data: () => {
			if (!options().enabled) return undefined;
			state.headArgs.push(args());
			return head();
		},
		error: () => state.headError,
	}),
	useConvexClient: () => ({
		query: (ref: string, args: unknown) => {
			if (ref === "firstPageFloor") {
				state.floorCalls++;
				const fail = state.floorFailures > 0;
				if (fail) state.floorFailures--;
				return (state.floorGate ?? Promise.resolve()).then(() => {
					if (fail) throw new Error("boom");
					return state.floor;
				});
			}
			return state.listBefore(args);
		},
	}),
}));

import {
	mergeRows,
	useFlooredLog,
	type FlooredLog,
	type FlooredLogQueries,
} from "./useFlooredLog.ts";

const PAGE_SIZE = 2;
const QUERIES = {
	firstPageFloor: "firstPageFloor",
	listSince: "listSince",
	listBefore: "listBefore",
} as unknown as FlooredLogQueries<Row>;

function row(id: string, at = 0): Row {
	return { _id: id, at };
}

function page(rows: Row[], continueCursor: string, isDone: boolean) {
	return { page: rows, continueCursor, isDone };
}

let dispose: (() => void) | undefined;

function mount(options: { start?: () => boolean } = {}): FlooredLog<Row> {
	const start = options.start ?? (() => true);
	return createRoot((d) => {
		dispose = d;
		return useFlooredLog<Row>({
			queries: QUERIES,
			pageSize: PAGE_SIZE,
			start,
		});
	});
}

beforeEach(() => {
	state.floor = { since: 100 };
	state.floorFailures = 0;
	state.floorCalls = 0;
	state.floorGate = undefined;
	state.headError = undefined;
	state.listBefore = vi.fn();
	state.headArgs = [];
	setHead([]);
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
});

describe("mergeRows", () => {
	it("keeps order and drops rows present in both lists", () => {
		const merged = mergeRows([row("a"), row("b")], [row("b"), row("c")]);
		expect(merged.map((r) => r._id)).toEqual(["a", "b", "c"]);
	});
});

describe("useFlooredLog", () => {
	it("reads the floor only once start turns true, then serves the head from it", async () => {
		const [start, setStart] = createSignal(false);
		setHead([row("a")]);
		const log = mount({ start });
		await Promise.resolve();
		expect(state.floorCalls).toBe(0);
		expect(log.rows()).toBeUndefined();

		setStart(true);
		await waitFor(() => {
			expect(log.rows()?.map((r) => r._id)).toEqual(["a"]);
		});
		expect(state.headArgs.at(-1)).toEqual({ since: 100 });
		expect(log.canLoadMore()).toBe(true);
	});

	it("loads older pages from the cursor, once each, dedupes the overlap and stops when done", async () => {
		setHead([row("a"), row("b")]);
		state.listBefore
			.mockResolvedValueOnce(page([row("b"), row("c")], "c1", false))
			.mockResolvedValueOnce(page([row("d")], "c2", true));
		const log = mount();
		await waitFor(() => {
			expect(log.canLoadMore()).toBe(true);
		});

		await log.loadMore();
		expect(log.rows()?.map((r) => r._id)).toEqual(["a", "b", "c"]);
		await log.loadMore();
		expect(log.rows()?.map((r) => r._id)).toEqual(["a", "b", "c", "d"]);
		expect(state.listBefore).toHaveBeenNthCalledWith(1, {
			before: 100,
			paginationOpts: { numItems: PAGE_SIZE, cursor: null },
		});
		expect(state.listBefore).toHaveBeenNthCalledWith(2, {
			before: 100,
			paginationOpts: { numItems: PAGE_SIZE, cursor: "c1" },
		});
		expect(log.canLoadMore()).toBe(false);
		await log.loadMore();
		expect(state.listBefore).toHaveBeenCalledTimes(2);
	});

	it("a null floor means the head is everything", async () => {
		state.floor = { since: null };
		setHead([row("a")]);
		const log = mount();
		await waitFor(() => {
			expect(log.rows()).toHaveLength(1);
		});
		expect(log.canLoadMore()).toBe(false);
		await log.loadMore();
		expect(state.listBefore).not.toHaveBeenCalled();
	});

	it("a load asked for before the floor arrives runs once it does", async () => {
		const gate: { open?: () => void } = {};
		state.floorGate = new Promise<void>((resolve) => {
			gate.open = resolve;
		});
		setHead([row("a")]);
		state.listBefore.mockResolvedValue(page([row("o")], "c1", true));
		const log = mount();
		await log.loadMore();
		expect(state.listBefore).not.toHaveBeenCalled();

		gate.open?.();
		await waitFor(() => {
			expect(log.rows()?.map((r) => r._id)).toEqual(["a", "o"]);
		});
		expect(state.listBefore).toHaveBeenCalledTimes(1);
	});

	it("a failed floor reports failure and the next start retries it", async () => {
		state.floorFailures = 1;
		const [start, setStart] = createSignal(true);
		setHead([row("a")]);
		const log = mount({ start });
		await waitFor(() => {
			expect(log.failed()).toBe(true);
		});
		expect(log.rows()).toBeUndefined();

		setStart(false);
		setStart(true);
		await waitFor(() => {
			expect(log.rows()?.map((r) => r._id)).toEqual(["a"]);
		});
		expect(log.failed()).toBe(false);
		expect(state.floorCalls).toBe(2);
	});

	it("a failed head query reports failure", async () => {
		state.headError = new Error("boom");
		const log = mount();
		await waitFor(() => {
			expect(log.failed()).toBe(true);
		});
	});

	it("a failed older page says so, and the next load retries from the same cursor", async () => {
		setHead([row("a")]);
		state.listBefore
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce(page([row("o")], "c1", true));
		const log = mount();
		await waitFor(() => {
			expect(log.canLoadMore()).toBe(true);
		});

		await log.loadMore();
		expect(log.loadFailed()).toBe(true);
		expect(log.loading()).toBe(false);
		await log.loadMore();
		expect(log.loadFailed()).toBe(false);
		expect(log.rows()?.map((r) => r._id)).toEqual(["a", "o"]);
		expect(state.listBefore).toHaveBeenLastCalledWith({
			before: 100,
			paginationOpts: { numItems: PAGE_SIZE, cursor: null },
		});
	});

	it("loads one page at a time while a load is pending", async () => {
		setHead([row("a")]);
		const gate: { release?: (value: unknown) => void } = {};
		state.listBefore.mockReturnValue(
			new Promise((resolve) => {
				gate.release = resolve;
			})
		);
		const log = mount();
		await waitFor(() => {
			expect(log.canLoadMore()).toBe(true);
		});

		const first = log.loadMore();
		void log.loadMore();
		expect(log.loading()).toBe(true);
		expect(state.listBefore).toHaveBeenCalledTimes(1);
		gate.release?.(page([], "c1", true));
		await first;
		expect(log.loading()).toBe(false);
	});
});
