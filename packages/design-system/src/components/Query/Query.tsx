import {
	createContext,
	children,
	createSignal,
	Show,
	untrack,
	type Accessor,
	type JSX,
} from "solid-js";

import { useRequiredContext } from "../../utils/context.ts";
import { createPresence } from "../../utils/presence.tsx";
import { Skeleton } from "../Skeleton/Skeleton.tsx";
import { SkeletonList } from "../Skeleton/SkeletonList.tsx";

/**
 * Loading, empty and loaded states for data that is `undefined` while it
 * loads (a live query, say). `Query.Root` provides the state and renders no
 * element; the parts read it at any depth. Never Suspense: loading is
 * controlled by `data === undefined`.
 *
 * `data` is meant to be an array or an object/null. A loaded falsy scalar
 * (0, "", false) renders nothing in Content.
 *
 * Content waits until Root has resolved all its parts, so part order does not
 * change what is built. Still place Empty and Skeleton before Content: parts
 * mounted later (inside a lazily-mounted subtree) are only seen from then on.
 */
type QueryState = {
	data: Accessor<unknown>;
	hasEmpty: Accessor<boolean>;
	hasSkeleton: Accessor<boolean>;
	settled: Accessor<boolean>;
	registerEmpty: () => void;
	registerSkeleton: () => void;
};

const QueryContext = createContext<QueryState>();

function useQueryState(part: string): QueryState {
	return useRequiredContext(QueryContext, `Query.${part}`, "Query.Root");
}

function isEmpty(value: unknown): boolean {
	return value === null || (Array.isArray(value) && value.length === 0);
}

/** Resolves its children (so every part registers), then reports settled. */
function Settle(props: {
	onSettled: () => void;
	children: JSX.Element;
}): JSX.Element {
	const resolved = children(() => props.children);
	untrack(() => {
		props.onSettled();
	});
	return <>{resolved()}</>;
}

export type QueryRootProps = { data: unknown; children: JSX.Element };

export type QueryContentProps<T> = {
	of: T | null | undefined;
	children: (data: Accessor<NonNullable<T>>) => JSX.Element;
};

/** `Query.Empty` and `Query.Skeleton`: their content, shown verbatim. */
export type QueryPartProps = { children: JSX.Element };

function Root(props: QueryRootProps): JSX.Element {
	const [hasEmpty, registerEmpty] = createPresence();
	const [hasSkeleton, registerSkeleton] = createPresence();
	const [settled, setSettled] = createSignal(false);

	return (
		<QueryContext.Provider
			value={{
				data: () => props.data,
				hasEmpty,
				hasSkeleton,
				settled,
				registerEmpty,
				registerSkeleton,
			}}
		>
			<Settle onSettled={() => setSettled(true)}>{props.children}</Settle>
		</QueryContext.Provider>
	);
}

/** The loaded content. Takes its own `of` (the same value as Root's `data`)
 *  so `rows` is typed: context cannot carry Root's type. */
function Content<T>(props: QueryContentProps<T>): JSX.Element {
	const state = useQueryState("Content");
	return (
		<Show when={state.settled()}>
			<Show
				when={props.of !== undefined}
				fallback={
					<Show when={!state.hasSkeleton()}>
						<SkeletonList />
					</Show>
				}
			>
				<Show when={!(state.hasEmpty() && isEmpty(props.of))}>
					<Show when={props.of as NonNullable<T> | null | undefined}>
						{(data) => props.children(data)}
					</Show>
				</Show>
			</Show>
		</Show>
	);
}

/** Shown when the data is loaded and empty (`null` or `[]`). */
function Empty(props: QueryPartProps): JSX.Element {
	const state = useQueryState("Empty");
	state.registerEmpty();
	return (
		<Show when={state.data() !== undefined && isEmpty(state.data())}>
			{props.children}
		</Show>
	);
}

/** Replaces Content's default skeleton while loading. Rendered verbatim. */
function QuerySkeleton(props: QueryPartProps): JSX.Element {
	const state = useQueryState("Skeleton");
	state.registerSkeleton();
	return <Show when={state.data() === undefined}>{props.children}</Show>;
}

/** The array's length, or a short skeleton bar while loading. */
function Count(): JSX.Element {
	const state = useQueryState("Count");
	return (
		<Show
			when={state.data() !== undefined}
			fallback={<Skeleton width="short" />}
		>
			<Show when={Array.isArray(state.data())}>
				{String((state.data() as unknown[]).length)}
			</Show>
		</Show>
	);
}

export const Query = { Root, Content, Empty, Skeleton: QuerySkeleton, Count };
