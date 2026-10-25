import {
	type Accessor,
	createContext,
	createMemo,
	mergeProps,
	Show,
	useContext,
	type JSX,
} from "solid-js";

import { MORPH_OF } from "../../utils/morphNames.ts";
import { morphTitle } from "../../utils/morphPairing.ts";
import type { TriggerProps } from "../../utils/triggerProps.ts";

import styles from "./Morph.module.scss";

/** An element that can take part in a morph as one record. */
export type Morphable = {
	/** The id that pairs this element with the overlay it morphs into (a
	 *  row, card or list item and the sheet of the same record). */
	morphId?: string;
};

/**
 * The DOM attributes that mark an element as `props.morphId`'s: none
 * without an id. A getter, so a spread follows the id as it changes.
 */
export function morphAttributes(props: Morphable): {
	[MORPH_OF]?: string;
} {
	return {
		get [MORPH_OF]() {
			return props.morphId;
		},
	};
}

/** Whether the surrounding element stands for an entity (has a `morphId`). */
const MorphScopeContext = createContext<Accessor<boolean>>(() => false);

/** Wraps the parts of an element that may stand for an entity (a card, a
 *  list item), so its title can mark itself ({@link useMorphTitle}). */
export function MorphScope(
	props: Morphable & { children: JSX.Element }
): JSX.Element {
	const hasMorph = createMemo(() => props.morphId !== undefined);
	return (
		<MorphScopeContext.Provider value={hasMorph}>
			{props.children}
		</MorphScopeContext.Provider>
	);
}

/** A title part's marking: the morph's title inside a {@link MorphScope}
 *  with a `morphId`, so it flies into the title of the overlay the element
 *  opens; nothing elsewhere. Spread it: `{...title()}`. */
export function useMorphTitle(): Accessor<typeof morphTitle | undefined> {
	const hasMorph = useContext(MorphScopeContext);
	return () => (hasMorph() ? morphTitle : undefined);
}

export type MorphProps = Required<Morphable> & {
	/** Render the consumer's own element instead of a `<div>`, the way an Ark
	 *  part's `asChild` does: spread `props(ownProps)` onto it. */
	asChild?: (
		props: (userProps?: JSX.IntrinsicElements["div"]) => TriggerProps<"div">
	) => JSX.Element;
	children?: JSX.Element;
};

/**
 * Marks an element as showing a record, so a sheet for that record can
 * close into it after the element it opened from is gone (it moved, or the
 * sheet was opened from somewhere else). Only an attribute: no registry, no
 * effect, so a list of hundreds costs nothing. The default `<div>` paints
 * nothing; a morph into it uses the one element inside that paints (its
 * painted box, morph.ts).
 */
export function Morph(props: MorphProps): JSX.Element {
	function childProps(
		userProps?: JSX.IntrinsicElements["div"]
	): TriggerProps<"div"> {
		// eslint-disable-next-line solid/reactivity -- the merged object goes straight to the caller's spread, which tracks it
		return mergeProps(userProps ?? {}, morphAttributes(props));
	}
	return (
		<Show
			when={props.asChild}
			fallback={
				<div class={styles.morph} {...morphAttributes(props)}>
					{props.children}
				</div>
			}
		>
			{(asChild) => asChild()(childProps)}
		</Show>
	);
}
