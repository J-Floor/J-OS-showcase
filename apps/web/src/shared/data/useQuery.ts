import type { FunctionArgs, FunctionReference } from "convex/server";
import { useQuery as useConvexQuery } from "convex-solidjs";
import {
	createComputed,
	createMemo,
	on,
	onCleanup,
	type Accessor,
} from "solid-js";

import { LINGER_TTL, retain } from "./queryKeeper.ts";

type MaybeAccessor<T> = T | Accessor<T>;

/** convex-solidjs's options (`enabled`, `initialData`, `keepPreviousData`),
 *  read off its signature: the parameter is `T | Accessor<T>`, and this is `T`. */
type ConvexQueryOptions<Q extends FunctionReference<"query">> = ReturnType<
	Extract<NonNullable<Parameters<typeof useConvexQuery<Q>>[2]>, () => unknown>
>;

/** The app's options: convex-solidjs's, plus the keeper's `linger`. */
type QueryOptions<Q extends FunctionReference<"query">> =
	ConvexQueryOptions<Q> & {
		/** Hand the query to the keeper when its reader goes away. Off for a
		 *  one-shot read nobody comes back to. @default true */
		linger?: boolean;
	};

function resolve<T>(value: MaybeAccessor<T>): T {
	return typeof value === "function" ? (value as Accessor<T>)() : value;
}

/**
 * The app's `useQuery`: `convex-solidjs`'s, with `keepPreviousData` on by
 * default and a linger on the way out. When the reader goes away (unmount or
 * new args), the query is handed to the keeper for `LINGER_TTL`, so coming
 * back reads it at once; `linger: false` skips that.
 */
export function useQuery<Q extends FunctionReference<"query">>(
	query: Q,
	args: MaybeAccessor<FunctionArgs<Q>>,
	options?: MaybeAccessor<QueryOptions<Q>>
) {
	const resolvedOptions = createMemo(() => ({
		keepPreviousData: true,
		...resolve(options ?? {}),
	}));
	// eslint-disable-next-line solid/reactivity -- passed as an accessor, read inside convex-solidjs's own tracked scopes
	const result = useConvexQuery(query, args, resolvedOptions);
	createComputed(
		on(
			[
				() => resolve(args),
				() => resolvedOptions().enabled,
				() => resolvedOptions().linger,
			],
			([current, enabled, linger]) => {
				if (enabled === false || linger === false) return;
				onCleanup(() => {
					retain(query, current, LINGER_TTL);
				});
			}
		)
	);
	return result;
}
