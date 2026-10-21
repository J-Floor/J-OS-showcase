import type {
	FunctionReference,
	PaginationOptions,
	PaginationResult,
} from "convex/server";
import { useConvexClient } from "convex-solidjs";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
} from "solid-js";

import { call } from "../../lib/call.ts";

import { useQuery } from "./useQuery.ts";

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

type ConvexClient = ReturnType<typeof useConvexClient>;

/** A call, not a read of a flag: TypeScript would otherwise keep the `false`
 * it narrowed to before an `await` across it. */
function useDisposedCheck(): () => boolean {
	let hasBeenDisposed = false;
	onCleanup(() => {
		hasBeenDisposed = true;
	});
	return () => hasBeenDisposed;
}

/** Reads the floor once `start` first turns true; a failed read is tried again
 * the next time `start` turns true. */
function useFloor<Row>(options: {
	client: ConvexClient;
	query: FlooredLogQueries<Row>["firstPageFloor"];
	start: Accessor<boolean>;
	isDisposed: () => boolean;
}): { floor: Accessor<Floor | undefined>; floorFailed: Accessor<boolean> } {
	const [floor, setFloor] = createSignal<Floor>();
	const [floorFailed, setFloorFailed] = createSignal(false);
	let isFloorRequested = false;

	createEffect(() => {
		if (!options.start() || isFloorRequested) return;
		isFloorRequested = true;
		setFloorFailed(false);
		if (!options.client) {
			setFloorFailed(true);
			return;
		}
		options.client
			.query(options.query, {})
			.then((result) => {
				if (options.isDisposed()) return;
				setFloor(result);
			})
			.catch(() => {
				if (options.isDisposed()) return;
				isFloorRequested = false;
				setFloorFailed(true);
			});
	});

	return { floor, floorFailed };
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
	const isDisposed = useDisposedCheck();
	const { floor, floorFailed } = useFloor({
		client,
		query: options.queries.firstPageFloor,
		start: options.start,
		isDisposed,
	});
	const [older, setOlder] = createSignal<Row[]>([]);
	const [exhausted, setExhausted] = createSignal(false);
	const [loading, setLoading] = createSignal(false);
	const [loadFailed, setLoadFailed] = createSignal(false);
	let cursor: string | null = null;
	let isBusy = false;
	let isWanted = false;

	const head = useQuery(
		options.queries.listSince,
		() => ({ since: floor()?.since ?? null }),
		() => ({ enabled: floor() !== undefined })
	);

	createEffect(() => {
		if (floor() === undefined || !isWanted) return;
		isWanted = false;
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
			isWanted = true;
			return;
		}
		if (!client || since === null || isBusy || exhausted()) return;
		await loadOlderPage(client, since);
	}

	async function loadOlderPage(
		activeClient: NonNullable<ConvexClient>,
		since: number
	): Promise<void> {
		isBusy = true;
		setLoading(true);
		setLoadFailed(false);
		const result = await call(
			activeClient.query(options.queries.listBefore, {
				before: since,
				paginationOpts: { numItems: options.pageSize, cursor },
			}),
			"Could not load older entries."
		);
		isBusy = false;
		if (isDisposed()) return;
		setLoading(false);
		if (result.isErr()) {
			setLoadFailed(true);
			return;
		}
		setOlder((prev) => [...prev, ...result.value.page]);
		cursor = result.value.continueCursor;
		if (result.value.isDone) setExhausted(true);
	}

	return { rows, failed, canLoadMore, loading, loadFailed, loadMore };
}
