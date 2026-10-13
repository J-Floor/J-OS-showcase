import type { ConvexClient } from "convex/browser";
import {
	getFunctionName,
	type FunctionArgs,
	type FunctionReference,
} from "convex/server";
import { convexToJson, type Value } from "convex/values";
import { createSignal, untrack } from "solid-js";

export const LINGER_TTL = 5 * 60_000;
export const PREFETCH_TTL = 60_000;
export const MAX_KEPT = 50;

type Kept = {
	unsubscribe: () => void;
	timer: ReturnType<typeof setTimeout>;
	expiresAt: number;
};

/**
 * Convex drops a query's result the moment its last subscriber leaves, so a
 * page revisit or a drawer re-open waits a full round trip. The keeper holds a
 * no-op subscription for a while after that, so `localQueryResult` still hits
 * and the next reader gets data on its first fetch. In memory only.
 *
 * Map insertion order is recency: a retain re-inserts its key, so the first
 * key is the one to drop when the keeper is full.
 */
const kept = new Map<string, Kept>();
let client: ConvexClient | undefined;
// A signal, so a warm-up can wait for a session before it prefetches.
const [active, setActive] = createSignal(false);

export function bindQueryKeeper(next: ConvexClient | undefined): void {
	releaseAll();
	client = next;
}

/** The keeper holds nothing unless a session is known; going inactive drops everything. */
export function setKeeperActive(next: boolean): void {
	setActive(next);
	if (!next) releaseAll();
}

/** Whether the keeper holds anything. Reactive. */
export function isKeeperActive(): boolean {
	return active();
}

function keyOf(query: FunctionReference<"query">, args: unknown): string {
	return `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;
}

function release(key: string): void {
	const entry = kept.get(key);
	if (!entry) return;
	clearTimeout(entry.timer);
	kept.delete(key);
	entry.unsubscribe();
}

export function retain<Q extends FunctionReference<"query">>(
	query: Q,
	args: FunctionArgs<Q>,
	ttlMs: number
): void {
	if (!untrack(active) || !client || client.disabled) return;
	const key = keyOf(query, args);
	const expiresAt = Date.now() + ttlMs;
	const existing = kept.get(key);
	if (existing) {
		kept.delete(key);
		if (expiresAt > existing.expiresAt) {
			clearTimeout(existing.timer);
			existing.timer = setTimeout(() => {
				release(key);
			}, ttlMs);
			existing.expiresAt = expiresAt;
		}
		kept.set(key, existing);
		return;
	}
	if (kept.size >= MAX_KEPT) {
		const oldest = kept.keys().next().value;
		if (oldest !== undefined) release(oldest);
	}
	const unsubscribe = client.onUpdate(
		query,
		args,
		() => undefined,
		() => undefined
	);
	kept.set(key, {
		unsubscribe,
		timer: setTimeout(() => {
			release(key);
		}, ttlMs),
		expiresAt,
	});
}

/** A hint that `query(args)` is about to be read. Failures are ignored. */
export function prefetch<Q extends FunctionReference<"query">>(
	query: Q,
	args: FunctionArgs<Q>
): void {
	retain(query, args, PREFETCH_TTL);
}

export function releaseAll(): void {
	for (const key of [...kept.keys()]) release(key);
}

export function keptCount(): number {
	return kept.size;
}

/** A drawer's per-row query: the function and how one row's id becomes its
 *  args. The drawer reads it and a descriptor prefetches it through the same
 *  spec, so both land on the same keeper key. */
export type QuerySpec<Q extends FunctionReference<"query">, Key> = {
	query: Q;
	args: (key: Key) => FunctionArgs<Q>;
};

/** {@link prefetch} for one row of a {@link QuerySpec}. */
export function prefetchSpec<Q extends FunctionReference<"query">, Key>(
	spec: QuerySpec<Q, Key>,
	key: Key
): void {
	prefetch(spec.query, spec.args(key));
}
