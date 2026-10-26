import {
	type Accessor,
	type Setter,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	on,
	untrack,
} from "solid-js";

import { isActivationThroughPopup, recentActivation } from "./activation.ts";
import {
	type Claim,
	claimHandoff,
	hasContainer,
	joinHandoff,
	morph,
} from "./morph.ts";
import { MORPH_HIDDEN, MORPH_LIST_ROW, MORPH_PICKED } from "./morphNames.ts";
import { ENTITY_ROW, findMorphTarget } from "./morphPairing.ts";
import { afterTransition, canAnimate } from "./viewTransition.ts";
import { hasLayoutBox, nearestVisibleAnchor } from "./visibleArea.ts";

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
	morphId?: string | false;
	morphFrom?: MorphFrom;
};

/** The presence options an overlay's {@link MorphOverlayProps} stand for. */
export function overlayMorphOptions(props: MorphOverlayProps) {
	return {
		enabled: () => props.morphId !== false,
		closeTarget: () =>
			typeof props.morphId === "string"
				? findMorphTarget(props.morphId)
				: null,
		morphFrom: () => props.morphFrom?.(),
	};
}

/** A row picked inside an overlay, the close's source: an entity row, or
 *  any list row (a palette result that shows no entity, a page). */
const PICKED_ROW = `li, [${MORPH_LIST_ROW}], ${ENTITY_ROW}`;

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

/** A row activated inside the overlay; a bare button (Cancel, close) is not
 *  one, nor a pick in a popup opened from inside it. */
function activatedInside(content: HTMLElement | null): HTMLElement | null {
	const activated = recentActivation();
	// A pick in a popup opened from inside resolves to the popup's trigger:
	// it was made in the popup, not on a row of the overlay.
	if (
		!activated ||
		!content?.contains(activated) ||
		isActivationThroughPopup()
	)
		return null;
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
 *  fallback on screen. An activation inside a fallback on screen belongs to
 *  that surface (a button on a bar the overlay grows from): the fallback is
 *  the source then. */
function openFrom(options: {
	content: () => HTMLElement | null;
	morphFrom?: MorphFrom;
}): HTMLElement | null {
	const content = options.content();
	const fallbacks = [options.morphFrom?.()].flat().filter(hasLayoutBox);
	const activation = outside(content, recentActivation());
	const surface = fallbacks.find((fallback) => fallback.contains(activation));
	return (
		outside(content, surface ?? null) ??
		activation ??
		outside(content, fallbacks[0] ?? null)
	);
}

function closeFrom(content: HTMLElement | null): HTMLElement | null {
	return (
		content?.querySelector<HTMLElement>(`[${MORPH_PICKED}]`) ??
		activatedInside(content) ??
		content
	);
}

function closeTo(
	closingSource: HTMLElement | null,
	closeTarget: (() => HTMLElement | null) | undefined
): HTMLElement | null {
	return nearestVisibleAnchor(closingSource) ?? closeTarget?.() ?? null;
}

function clearPicked(content: HTMLElement | null): void {
	content?.querySelector(`[${MORPH_PICKED}]`)?.removeAttribute(MORPH_PICKED);
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
	/**
	 * Read as the overlay closes: true hands its source and opener to the
	 * overlay that claims its handoff, which then takes its place (a sheet
	 * stepping aside for its discard prompt). A source handed to this
	 * overlay is always handed on.
	 */
	handsOnSource?: Accessor<boolean>;
};

type PresenceState = {
	setShown: Setter<boolean>;
	/** What the overlay opened out of, hidden while it is open. */
	source: HTMLElement | null;
	/** The source was handed to this overlay with a handoff: it goes on
	 *  with the next one. */
	isSourceHanded: boolean;
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

/**
 * The update that shows the overlay, hiding `source` when the overlay takes
 * its place. Whether it does is measured now, before the update, like the
 * morph's own container check.
 */
function showOver(
	state: PresenceState,
	source: HTMLElement | null
): () => void {
	const isReplaced = takesPlaceOf(source);
	return () => {
		state.setShown(true);
		if (isReplaced && !state.isDisposed && state.source === source)
			hideSource(source);
	};
}

/**
 * Opens as the target of a claimed handoff. With what the closer handed
 * on, the overlay takes the closer's place: its source (hidden, as the
 * closer hid it) and its opener.
 */
function takeHandoff(state: PresenceState, claim: Claim): void {
	const { handedOn } = claim;
	const source = handedOn?.source ?? null;
	state.source = source;
	state.isSourceHanded = handedOn !== undefined;
	state.opener = handedOn?.opener ?? state.opener;
	void joinHandoff(showOver(state, source));
}

function show(state: PresenceState, options: PresenceOptions): void {
	state.openedFor = options.shows?.();
	state.opener = outside(options.content(), activeElement()) ?? state.opener;
	if (!options.enabled()) {
		state.setShown(true);
		return;
	}
	const claim = state.isClosing ? null : claimHandoff(options.content);
	if (claim) {
		takeHandoff(state, claim);
		return;
	}
	const source = openFrom(options);
	state.source = source;
	state.isSourceHanded = false;
	if (state.opener === null || state.opener === document.body) {
		state.opener = source;
	}
	void morph({
		from: source,
		to: options.content,
		update: showOver(state, source),
	});
}

function hide(state: PresenceState, options: PresenceOptions): void {
	const content = options.content();
	const closingSource = state.source;
	state.source = null;
	if (!options.enabled()) {
		unhideSource(closingSource);
		state.setShown(false);
		clearPicked(content);
		restoreFocus(state.opener, content);
		return;
	}
	state.isClosing = true;
	const handsOn =
		state.isSourceHanded || options.handsOnSource?.() === true
			? { source: closingSource, opener: state.opener }
			: undefined;
	state.isSourceHanded = false;
	void morph({
		from: closeFrom(content),
		direction: "close",
		handsOn,
		to: () => closeTo(closingSource, options.closeTarget),
		update: () => {
			unhideSource(closingSource);
			state.setShown(false);
		},
	}).then(({ handedOff }) => {
		state.isClosing = false;
		clearPicked(content);
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
		isSourceHanded: false,
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
		on(options.open, (isOpen) => {
			if (isOpen === state.isRequested) return;
			state.isRequested = isOpen;
			if (isOpen) show(state, options);
			else hide(state, options);
		})
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

type Held<T> = {
	value: T | undefined;
	isLive: boolean;
	/** Which let-go this is; 0 before the first. */
	letGo: number;
};

/**
 * `value` while `live`; once `live` turns false, the last live value until
 * the morph that change started has finished (without one, until the next
 * microtask), then `undefined`. For what an overlay showed or opened out of,
 * which must still be on screen when the browser captures it: a sheet's row
 * after its selection was cleared, a drag preview a sheet grows out of.
 *
 * The morph starts in the effects the change sets off, so the wait for it
 * begins a microtask later. `settled`, when given, is waited for after the
 * morph: what else must end first (an overlay's own CSS exit, which plays
 * when there is no morph). A later let-go is not ended by an earlier one's
 * morph finishing.
 */
export function createMorphHold<T>(
	value: Accessor<T>,
	live: Accessor<boolean>,
	settled?: () => Promise<unknown>
): Accessor<T | undefined> {
	const [released, setReleased] = createSignal(0);
	let letGos = 0;
	function releaseAfterMorph(letGo: number): void {
		queueMicrotask(() => {
			void afterTransition()
				.then(() => settled?.())
				.then(() => {
					setReleased((last) => Math.max(last, letGo));
				});
		});
	}
	const held = createMemo<Held<T>>(
		(previous) => {
			if (live()) return { ...previous, value: value(), isLive: true };
			if (!previous.isLive) return previous;
			letGos += 1;
			releaseAfterMorph(letGos);
			return { value: previous.value, isLive: false, letGo: letGos };
		},
		{ value: undefined, isLive: false, letGo: 0 }
	);
	const kept = createMemo(() => {
		const { value: shown, isLive, letGo } = held();
		return isLive || letGo > released() ? shown : undefined;
	});
	return kept;
}
