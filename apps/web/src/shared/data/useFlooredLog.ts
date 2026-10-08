import type {
	FunctionReference,
	PaginationOptions,
	PaginationResult,
} from "convex/server";
import { useConvexClient, useQuery } from "convex-solidjs";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
} from "solid-js";

type Floor = { since: number | null };

export type FlooredLogQueries<Row> = {
	/** The timestamp the live head starts at, or null when one page holds
	 *  everything. */
	firstPageFloor: FunctionReference<
		"query",
		"public",
		Record<string, never>,
		Floor
	>;
	/** Rows at or above the floor (all of them when null), newest first. */
	listSince: FunctionReference<"query", "public", Floor, Row[]>;
	/** One page of rows below the floor, newest first. */
	listBefore: FunctionReference<
		"query",
		"public",
		{ before: number; paginationOpts: PaginationOptions },
		PaginationResult<Row>
	>;
};

export type FlooredLog<Row> = {
	/** The live head, then the older pages, newest first; undefined until the
	 *  head has loaded. */
	rows: Accessor<Row[] | undefined>;
	failed: Accessor<boolean>;
	canLoadMore: Accessor<boolean>;
	loading: Accessor<boolean>;
	loadFailed: Accessor<boolean>;
	loadMore: () => Promise<void>;
};

/** Rows in both lists show once; the first occurrence wins, order is kept. */
export function mergeRows<Row extends { _id: string }>(
	head: Row[],
	older: Row[]
): Row[] {
	const seen = new Set<string>();
	const merged: Row[] = [];
	for (const row of [...head, ...older]) {
		if (seen.has(row._id)) continue;
		seen.add(row._id);
		merged.push(row);
	}
	return merged;
}

/**
 * A newest-first log paged around a fixed floor: the floor is read once,
 * when `start` first turns true; rows at or above it are a live query; older
 * pages load on request, once each, and never update. A failed floor read is
 * tried again the next time `start` turns true. A load asked for before the
 * floor arrives runs once it does.
 */
export function useFlooredLog<Row extends { _id: string }>(options: {
	queries: FlooredLogQueries<Row>;
	pageSize: number;
	start: Accessor<boolean>;
}): FlooredLog<Row> {
	const client = useConvexClient();
	const [floor, setFloor] = createSignal<Floor>();
	const [floorFailed, setFloorFailed] = createSignal(false);
	const [older, setOlder] = createSignal<Row[]>([]);
	const [exhausted, setExhausted] = createSignal(false);
	const [loading, setLoading] = createSignal(false);
	const [loadFailed, setLoadFailed] = createSignal(false);
	let cursor: string | null = null;
	let floorRequested = false;
	let busy = false;
	let wanted = false;
	let disposed = false;
	onCleanup(() => {
		disposed = true;
	});
	// A call, not a read of `disposed`: TypeScript would otherwise keep the
	// `false` it narrowed to before an `await` across it.
	function isDisposed(): boolean {
		return disposed;
	}

	const head = useQuery(
		options.queries.listSince,
		() => ({ since: floor()?.since ?? null }),
		() => ({ enabled: floor() !== undefined, keepPreviousData: true })
	);

	createEffect(() => {
		if (!options.start() || floorRequested) return;
		floorRequested = true;
		setFloorFailed(false);
		if (!client) {
			setFloorFailed(true);
			return;
		}
		client
			.query(options.queries.firstPageFloor, {})
			.then((result) => {
				if (isDisposed()) return;
				if (result.since === null) setExhausted(true);
				setFloor(result);
			})
			.catch(() => {
				if (isDisposed()) return;
				floorRequested = false;
				setFloorFailed(true);
			});
	});

	createEffect(() => {
		if (floor() === undefined || !wanted) return;
		wanted = false;
		void loadMore();
	});

	const rows = createMemo<Row[] | undefined>(() => {
		const data = head.data();
		return data === undefined ? undefined : mergeRows(data, older());
	});

	function failed(): boolean {
		return floorFailed() || head.error() !== undefined;
	}

	function canLoadMore(): boolean {
		return typeof floor()?.since === "number" && !exhausted();
	}

	async function loadMore(): Promise<void> {
		if (isDisposed()) return;
		const since = floor()?.since;
		if (since === undefined) {
			wanted = true;
			return;
		}
		if (!client || since === null || busy || exhausted()) return;
		busy = true;
		setLoading(true);
		setLoadFailed(false);
		try {
			const result = await client.query(options.queries.listBefore, {
				before: since,
				paginationOpts: { numItems: options.pageSize, cursor },
			});
			if (isDisposed()) return;
			setOlder((prev) => [...prev, ...result.page]);
			cursor = result.continueCursor;
			if (result.isDone) setExhausted(true);
		} catch {
			if (!isDisposed()) setLoadFailed(true);
		} finally {
			busy = false;
			if (!isDisposed()) setLoading(false);
		}
	}

	return { rows, failed, canLoadMore, loading, loadFailed, loadMore };
}
