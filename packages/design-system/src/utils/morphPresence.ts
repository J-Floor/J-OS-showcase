import {
	type Accessor,
	type Setter,
	createEffect,
	createSignal,
	onCleanup,
	on,
	untrack,
} from "solid-js";

import { recentActivation } from "./activation.ts";
import { claimHandoff, hasContainer, morph } from "./morph.ts";
import { ENTITY_ROW, findMorphTarget } from "./morphPairing.ts";
import { canAnimate } from "./viewTransition.ts";
import { hasLayoutBox } from "./visibleArea.ts";

type Candidate = HTMLElement | null | undefined;

/**
 * Where an overlay opens from when nothing was just activated (a shortcut):
 * one element, or candidates in order, of which the first on screen is used
 * (a search field, else the compact button standing in for it on a narrow
 * screen).
 */
export type MorphFrom = () => Candidate | readonly Candidate[];

/** The morph props every overlay (Dialog, Sheet, CommandPalette) takes. */
export type MorphOverlayProps = {
	/**
	 * The entity the overlay shows: it closes into the on-screen element
	 * showing it (`Morph`, a table row) when the element it opened from is
	 * gone. `false` turns the morph off and the CSS pop-in plays instead.
	 */
	morph?: string | false;
	morphFrom?: MorphFrom;
};

/** The presence options an overlay's {@link MorphOverlayProps} stand for. */
export function overlayMorphOptions(props: MorphOverlayProps) {
	return {
		enabled: () => props.morph !== false,
		closeTarget: () =>
			typeof props.morph === "string"
				? findMorphTarget(props.morph)
				: null,
		morphFrom: () => props.morphFrom?.(),
	};
}

/** Marks the row a palette pick closes into (Enter leaves focus in the input). */
export const MORPH_FROM = "data-morph-from";
/** A morph source while its overlay is open; viewTransition.scss hides it. */
export const MORPH_HIDDEN = "data-morph-hidden";

/** A row picked inside an overlay, the close's source: an entity row, or
 *  any list item (a palette result that shows no entity, a page). */
const PICKED_ROW = `li, ${ENTITY_ROW}`;

type MorphPresence = {
	/** Pass to Ark as `open`. */
	shown: Accessor<boolean>;
};

function activeElement(): HTMLElement | null {
	return document.activeElement instanceof HTMLElement
		? document.activeElement
		: null;
}

function restoreFocus(
	opener: HTMLElement | null,
	content: HTMLElement | null
): void {
	const active = document.activeElement;
	const isStranded =
		active === document.body || content?.contains(active) === true;
	if (isStranded) opener?.focus();
}

/** A row activated inside the overlay; a bare button (Cancel, close) is not one. */
function activatedInside(content: HTMLElement | null): HTMLElement | null {
	const activated = recentActivation();
	if (!activated || !content?.contains(activated)) return null;
	const row = activated.closest<HTMLElement>(PICKED_ROW);
	return row && content.contains(row) ? row : null;
}

/** The element unless it is inside this overlay (an earlier activation there). */
function outside<T extends HTMLElement>(
	content: HTMLElement | null,
	element: T | null
): T | null {
	return content?.contains(element) ? null : element;
}

/** What the overlay opens out of: the last activation, else the first
 *  fallback on screen. */
function openFrom(options: {
	content: () => HTMLElement | null;
	morphFrom?: MorphFrom;
}): HTMLElement | null {
	const content = options.content();
	const fallback = [options.morphFrom?.()].flat().find(hasLayoutBox) ?? null;
	return outside(content, recentActivation()) ?? outside(content, fallback);
}

/** Opens as the target of a handoff that already named this overlay. Its
 *  look joins the closer's transition and wins: the target decides. */
function morphClaimed(
	content: () => HTMLElement | null,
	update: () => void
): void {
	void morph({ from: null, to: content, claimed: true, update });
}

function closeFrom(content: HTMLElement | null): HTMLElement | null {
	return (
		content?.querySelector<HTMLElement>(`[${MORPH_FROM}]`) ??
		activatedInside(content) ??
		content
	);
}

function closeTo(
	closingSource: HTMLElement | null,
	closeTarget: (() => HTMLElement | null) | undefined
): HTMLElement | null {
	return hasLayoutBox(closingSource)
		? closingSource
		: (closeTarget?.() ?? null);
}

function clearMorphFrom(content: HTMLElement | null): void {
	content?.querySelector(`[${MORPH_FROM}]`)?.removeAttribute(MORPH_FROM);
}

/**
 * Whether the overlay takes its source's place while open. Only a real morph
 * stands in for the source; without one (no API, reduced motion) the source
 * would just vanish behind the overlay. A source without a container (an
 * icon button) stays: the overlay grew out of it, it did not become it.
 */
function takesPlaceOf(source: HTMLElement | null): boolean {
	return source !== null && canAnimate() && hasContainer(source);
}

function hideSource(source: HTMLElement | null): void {
	source?.setAttribute(MORPH_HIDDEN, "");
}

function unhideSource(source: HTMLElement | null): void {
	source?.removeAttribute(MORPH_HIDDEN);
}

/**
 * Calls `release` when `shows` moves on from what the overlay opened for (a
 * prev/next step). Opening and naming the entity in one flush is not a step.
 */
function releaseOnStep(
	shows: Accessor<unknown> | undefined,
	openedFor: () => unknown,
	release: () => void
): void {
	if (!shows) return;
	createEffect(
		on(
			shows,
			(value) => {
				if (value !== openedFor()) release();
			},
			{ defer: true }
		)
	);
}

type PresenceOptions = {
	open: Accessor<boolean>;
	enabled: Accessor<boolean>;
	content: () => HTMLElement | null;
	closeTarget?: () => HTMLElement | null;
	morphFrom?: MorphFrom;
	/**
	 * What the overlay shows. When it changes while open (a sheet's prev/next),
	 * the source no longer stands for it: it is shown again and forgotten, so
	 * the close goes to `closeTarget`.
	 */
	shows?: Accessor<unknown>;
};

type PresenceState = {
	setShown: Setter<boolean>;
	/** What the overlay opened out of, hidden while it is open. */
	source: HTMLElement | null;
	/** Where focus goes back to on close. */
	opener: HTMLElement | null;
	/** The last value `open` asked for; `shown` lags it inside a transition. */
	isRequested: boolean;
	isDisposed: boolean;
	/** A reopen must not claim its own close's handoff. */
	isClosing: boolean;
	/** What `shows` was when the overlay opened. */
	openedFor: unknown;
};

function releaseSource(state: PresenceState): void {
	unhideSource(state.source);
	state.source = null;
}

function show(state: PresenceState, options: PresenceOptions): void {
	state.openedFor = options.shows?.();
	state.opener = outside(options.content(), activeElement()) ?? state.opener;
	if (!options.enabled()) {
		state.setShown(true);
		return;
	}
	if (!state.isClosing && claimHandoff(options.content)) {
		state.source = null;
		morphClaimed(options.content, () => {
			state.setShown(true);
		});
		return;
	}
	const source = openFrom(options);
	state.source = source;
	// Measured before the update, like the morph's own container check.
	const isReplaced = takesPlaceOf(source);
	if (state.opener === null || state.opener === document.body) {
		state.opener = source;
	}
	void morph({
		from: source,
		to: options.content,
		update: () => {
			state.setShown(true);
			if (isReplaced && !state.isDisposed && state.source === source)
				hideSource(source);
		},
	});
}

function hide(state: PresenceState, options: PresenceOptions): void {
	const content = options.content();
	const closingSource = state.source;
	state.source = null;
	if (!options.enabled()) {
		unhideSource(closingSource);
		state.setShown(false);
		clearMorphFrom(content);
		restoreFocus(state.opener, content);
		return;
	}
	state.isClosing = true;
	void morph({
		from: closeFrom(content),
		direction: "close",
		to: () => closeTo(closingSource, options.closeTarget),
		update: () => {
			unhideSource(closingSource);
			state.setShown(false);
		},
	}).then(({ handedOff }) => {
		state.isClosing = false;
		clearMorphFrom(content);
		if (!handedOff && !state.isRequested) {
			restoreFocus(state.opener, content);
		}
	});
}

/**
 * Open and close an overlay through a morph. `open` is the consumer's
 * request; `shown` is what Ark renders, flipped inside the transition so the
 * browser captures the page before the overlay appears.
 *
 * While open, the source is hidden: the overlay IS that element now, and two
 * copies on screen read as a duplicate. On close the source is shown again
 * before the new snapshot, so the overlay shrinks back into it, then focus
 * returns to where it was before the overlay opened. Ark's own focus restore
 * is off: inside a transition it fired before the source was visible again.
 * Safari does not focus a clicked button, so then the source is the opener.
 */
export function createMorphPresence(options: PresenceOptions): MorphPresence {
	const [shown, setShown] = createSignal(untrack(options.open));
	const state: PresenceState = {
		setShown,
		source: null,
		opener: null,
		isRequested: untrack(options.open),
		isDisposed: false,
		isClosing: false,
		openedFor: undefined,
	};
	onCleanup(() => {
		state.isDisposed = true;
		releaseSource(state);
	});
	createEffect(
		on(
			options.open,
			(isOpen) => {
				if (isOpen === state.isRequested) return;
				state.isRequested = isOpen;
				if (isOpen) show(state, options);
				else hide(state, options);
			},
			{ defer: true }
		)
	);
	releaseOnStep(
		options.shows,
		() => state.openedFor,
		() => {
			releaseSource(state);
		}
	);
	return { shown };
}
