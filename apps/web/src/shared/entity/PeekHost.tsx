import { createMorphHold } from "@j-os/design-system";
import { useNavigate, useSearchParams } from "@solidjs/router";
import {
	createEffect,
	createSignal,
	For,
	on,
	Show,
	type Accessor,
	type JSX,
} from "solid-js";

import { useAbility } from "../../lib/ability.tsx";
import type { EntityRow } from "../types.ts";

import { createEntitySelection } from "./createEntitySelection.ts";
import {
	canView,
	entityPath,
	slugOf,
	type EntityDescriptor,
} from "./entityDescriptor.ts";
import { entityDescriptors } from "./entityDescriptors.ts";
import { PeekContext } from "./PeekContext.tsx";
import { PEEK_PARAM, parsePeek, peekValue } from "./peekParam.ts";
import { createParameterClearer } from "./pushedOpen.ts";

/** One kind's peek: the sheet for the row the open param names, over
 *  whatever page is on screen. While `current` is false the param names
 *  another kind's peek: the sheet closes through its own transition and
 *  stays mounted (so the element a new peek opens from stays on screen)
 *  until the host lets it go. */
function PeekSlot<Row extends EntityRow>(props: {
	descriptor: EntityDescriptor<Row>;
	current: () => boolean;
}): JSX.Element {
	// eslint-disable-next-line solid/reactivity -- keyed: one descriptor per slot instance
	const desc = props.descriptor;
	const rows = desc.useRows();
	const selection = createEntitySelection<Row>({
		rows,
		param: PEEK_PARAM,
		slugOf: (row) => peekValue(desc, slugOf(desc, row)),
		// Another kind's value is not a dead link for this one.
		active: () => props.current(),
	});
	function viewIn() {
		const row = selection.selected();
		return {
			label: `View in ${desc.group}`,
			href: row ? entityPath(desc, row) : desc.route,
		};
	}
	return (
		<PeekContext.Provider
			value={{
				get viewIn() {
					return viewIn();
				},
			}}
		>
			{/* A peek loads without Suspense (see `lazyPeek`): nothing shows
			    while the chunk loads, and a refetch under the open sheet never
			    re-enters a fallback. */}
			<Show when={desc.peek} keyed>
				{(Peek) => (
					<Peek
						row={selection.selected()}
						loading={selection.loading()}
						open={selection.open() && props.current()}
						prebuild={selection.prebuild()}
						onOpenChange={(isOpen) => {
							if (!isOpen) selection.close();
						}}
					/>
				)}
			</Show>
		</PeekContext.Provider>
	);
}

/** One kind's slot. Held through the close so the sheet morphs back before
 *  it unmounts, whether the param was cleared or now names another kind (a
 *  task opened from a project's sheet): the outgoing sheet closes while the
 *  incoming one opens from the element that was clicked in it. */
function PeekKind<Row extends EntityRow>(props: {
	descriptor: EntityDescriptor<Row>;
	peeking: () => EntityDescriptor<EntityRow> | undefined;
}): JSX.Element {
	function current() {
		return props.peeking()?.key === props.descriptor.key;
	}
	// eslint-disable-next-line solid/reactivity -- one descriptor per kind, for the host's life
	const kind = props.descriptor;
	const shown = createMorphHold(() => kind, current);
	return (
		<Show when={shown()} keyed>
			{(desc) => <PeekSlot descriptor={desc} current={current} />}
		</Show>
	);
}

/** How long an open waits for its peek's chunk. A chunk slower than this
 *  (a slow network) opens the peek when it arrives, without its morph. */
export const PEEK_CHUNK_WAIT_MS = 300;

/**
 * The kind to show: `wanted`, once its peek's chunk has loaded (the same
 * `preload` a warm-up starts) or `PEEK_CHUNK_WAIT_MS` has passed. The peek's
 * sheet morphs open only when it mounts closed and then opens: a chunk still
 * on its way when the open is asked for would mount it already open, and it
 * would show flat (a key's Enter, or a click quicker than the hover warm-up).
 * A kind waited for once is not waited for again.
 */
function createLoadedKind(
	wanted: Accessor<EntityDescriptor<EntityRow> | undefined>
): Accessor<EntityDescriptor<EntityRow> | undefined> {
	const [loaded, setLoaded] = createSignal<ReadonlySet<string>>(new Set());
	function markLoaded(key: string): void {
		setLoaded((keys) => (keys.has(key) ? keys : new Set(keys).add(key)));
	}
	createEffect(
		on(wanted, (desc) => {
			if (desc?.peek === undefined || loaded().has(desc.key)) return;
			const { key } = desc;
			const timer = setTimeout(() => {
				markLoaded(key);
			}, PEEK_CHUNK_WAIT_MS);
			// A failed load is the peek's to handle: it retries, then closes.
			void desc.peek
				.preload()
				.catch(() => {})
				.finally(() => {
					clearTimeout(timer);
					markLoaded(key);
				});
		})
	);
	function loadedKind(): EntityDescriptor<EntityRow> | undefined {
		const desc = wanted();
		return desc !== undefined && loaded().has(desc.key) ? desc : undefined;
	}
	return loadedKind;
}

/** Every descriptor the palette searches is the peek's lookup table. */
export function PeekHost(): JSX.Element {
	const [params, setParams] = useSearchParams();
	const navigate = useNavigate();
	const ability = useAbility();
	// One slot per kind that has a peek.
	const peekable = entityDescriptors.filter(
		(desc) => desc.peek !== undefined
	);
	function wanted() {
		return parsePeek(params[PEEK_PARAM]);
	}
	// Only a kind with a peek that this viewer may see: anything else never
	// mounts, not even for the length of a close.
	function descriptor() {
		const desc = peekable.find((entry) => entry.key === wanted()?.kind);
		return desc !== undefined && canView(ability(), desc)
			? desc
			: undefined;
	}
	const clear = createParameterClearer(
		PEEK_PARAM,
		params,
		setParams,
		navigate
	);
	createEffect(() => {
		if (params[PEEK_PARAM] !== undefined && descriptor() === undefined)
			clear();
	});
	const peeking = createLoadedKind(descriptor);
	return (
		<For each={peekable}>
			{(desc) => <PeekKind descriptor={desc} peeking={peeking} />}
		</For>
	);
}
