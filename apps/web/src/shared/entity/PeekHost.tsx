import { createMorphHold } from "@j-os/design-system";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, For, Show, type JSX } from "solid-js";

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
	return (
		<For each={peekable}>
			{(desc) => <PeekKind descriptor={desc} peeking={descriptor} />}
		</For>
	);
}
