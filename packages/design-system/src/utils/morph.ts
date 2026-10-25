/* eslint-disable max-lines -- one cohesive module: a morph's ends, its surface, its source and its flights decide together what each snapshot holds */
import { Result } from "neverthrow";

import {
	BOX_CLASS,
	BOX_SLOT_VARS,
	GHOST_GEOMETRY_VARS,
	MORPH_BOX_SLOTS,
	MORPH_GHOST,
	MORPH_LAYER,
	MORPH_PINNED,
	MORPH_PINNED_HELD,
	MORPH_SCRIM,
	MORPH_TITLE,
	SOURCE_CLIP_VAR,
	SURFACE_FROM_VARS,
	SURFACE_TO_VARS,
	type SurfaceProperties,
	boxSlotClass,
} from "./morphNames.ts";
import { ENTITY_SURFACE, keyedValues, titleIn } from "./morphPairing.ts";
import {
	PART_CLASS,
	type TransitionScope,
	canAnimate,
	isTransitionRunning,
	moveName,
	type PartName,
	partName,
	runningScope,
	stackedName,
	surfaceError,
	viewTransition,
} from "./viewTransition.ts";
import {
	clipInset,
	isFullyVisible,
	fullyVisibleOrNull,
	visibleRect,
} from "./visibleArea.ts";

/** A control that takes typing: a morph out of (or into) one scales. */
const TEXT_CONTROL = `input:not([type="checkbox"], [type="radio"]), textarea, [role="combobox"], [role="textbox"]`;
const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
const CLEAR = "rgba(0, 0, 0, 0)";
/** An alpha of 0: `rgba(r, g, b, 0)` or `rgb(r g b / 0)`. */
const ZERO_ALPHA = /(?:,[^,]*,[^,]*,|\/)\s*0(?:\.0*)?\s*\)$/;

/**
 * `box`: the box morphs and the content keeps its natural size, clipped to
 * it. `scale`: the browser's own geometry, the content scales with the box
 * (the search field growing into the palette). Picked by {@link lookOf}.
 */
type MorphLook = "box" | "scale";

/** What a surface morph draws: the box's fill, border and corner. */
type Surface = Record<keyof SurfaceProperties, string>;

/**
 * What a closing overlay hands to the one that takes its place, when it
 * hands them on: the element it opened out of and where focus goes back to.
 * The claimant then stands where the closer stood and closes as it would
 * have (a sheet's discard prompt closes into the sheet's row).
 */
export type HandedOn = {
	source: HTMLElement | null;
	opener: HTMLElement | null;
};

type Handoff = {
	claimedTarget?: () => HTMLElement | null;
	open: boolean;
	handedOn?: HandedOn;
};

/** A claimed handoff: what the closer handed on, if anything. */
export type Claim = { handedOn: HandedOn | undefined };

/** One handoff per transition session, keyed by its scope. */
const handoffs = new WeakMap<TransitionScope, Handoff>();

function handoffOf(scope: TransitionScope): Handoff {
	let handoff = handoffs.get(scope);
	if (!handoff) {
		handoff = { open: false };
		handoffs.set(scope, handoff);
	}
	return handoff;
}

function isClear(color: string): boolean {
	return color === "" || color === "transparent" || ZERO_ALPHA.test(color);
}

const matchesHeld = Result.fromThrowable((element: HTMLElement) =>
	element.matches(":hover, :active")
);

function isHeld(element: HTMLElement): boolean {
	return matchesHeld(element).unwrapOr(false);
}

/**
 * Reads `element`'s style at rest: a hovered or pressed button paints a
 * background its resting state does not, and a pinned one keeps it, so it
 * is read off an unhovered, unpinned copy, inserted and removed before
 * anything renders.
 */
function atRest<T>(
	element: HTMLElement,
	read: (style: CSSStyleDeclaration) => T
): T {
	const isAtRest = !isHeld(element) && !element.hasAttribute(MORPH_PINNED);
	if (isAtRest || !element.parentNode) {
		return read(getComputedStyle(element));
	}
	const copy = element.cloneNode(false) as HTMLElement;
	copy.removeAttribute("id");
	copy.removeAttribute(MORPH_PINNED);
	element.after(copy);
	try {
		return read(getComputedStyle(copy));
	} finally {
		copy.remove();
	}
}

function hasBorder(style: CSSStyleDeclaration): boolean {
	return BORDER_SIDES.some(
		(side) =>
			Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) >
				0 && !isClear(style.getPropertyValue(`border-${side}-color`))
	);
}

/** A background, a border or a shadow, at rest. */
function paints(element: HTMLElement): boolean {
	return atRest(
		element,
		(style) =>
			!isClear(style.backgroundColor) ||
			hasBorder(style) ||
			(style.boxShadow !== "" && style.boxShadow !== "none")
	);
}

/** The text control `element` is or holds, unless it is a row or entity. */
function textControlOf(element: HTMLElement): HTMLElement | null {
	if (element.matches(ENTITY_SURFACE)) return null;
	return element.matches(TEXT_CONTROL)
		? element
		: element.querySelector<HTMLElement>(TEXT_CONTROL);
}

function isTextField(element: HTMLElement): boolean {
	return textControlOf(element) !== null;
}

/**
 * The box `root`'s field paints on: the first element that paints, from its
 * text control up to `root` (the DS Field's input wrapper). `root` itself
 * counts only `isRootIncluded`: an end's own paint is {@link hasContainer}'s.
 */
function fieldBoxIn(
	root: HTMLElement,
	isRootIncluded = false
): HTMLElement | null {
	const stop = isRootIncluded ? root.parentElement : root;
	for (
		let node = textControlOf(root);
		node && node !== stop;
		node = node.parentElement
	) {
		if (paints(node)) return node;
	}
	return null;
}

/** A field root paints on the box around its control (the DS Field's input
 *  wrapper), not on itself: the field is that box. */
function fieldBoxPaints(root: HTMLElement): boolean {
	return fieldBoxIn(root) !== null;
}

/**
 * True when the element is a surface of its own: a table row or an entity
 * element, anything whose {@link paintedBox} paints a background, a border
 * or a shadow at rest, or a field root whose control's box does. A morph
 * out of one grows that surface into the target; one out of an icon button
 * or a bare glyph leaves it in place and grows the target out of its box.
 * Internal: exported for its tests.
 */
export function hasContainer(element: HTMLElement): boolean {
	return (
		element.matches(ENTITY_SURFACE) ||
		paints(paintedBox(element)) ||
		fieldBoxPaints(element)
	);
}

/**
 * The look of a morph out of (or, on close, into) `element`: a text field
 * with a container scales into its overlay (the search field into the
 * palette); anything else takes the box look (a surface morph out of a
 * container, a grow out of an icon's box). Measured before the update.
 */
function lookOf(element: HTMLElement | null): MorphLook {
	return element && isTextField(element) && hasContainer(element)
		? "scale"
		: "box";
}

function lookKind(look: MorphLook): "morph-scale" | "morph-box" {
	return look === "scale" ? "morph-scale" : "morph-box";
}

/**
 * Which morph holds each piece of shared state it sets: an element's pin,
 * the root's surface vars, the source clip. A morph that starts while
 * the last one is still finishing (a row clicked again as its sheet closes
 * into it) takes the same row and root vars; the earlier morph's cleanup
 * then lets go of only what it still holds, like the transition names
 * (`owner` in viewTransition.ts).
 */
class Holds {
	private readonly holders = new WeakMap<object, object>();

	take(key: object, holder: object): void {
		this.holders.set(key, holder);
	}

	/** True, and forgotten, if `holder` still holds `key`. */
	release(key: object, holder: object): boolean {
		if (this.holders.get(key) !== holder) return false;
		this.holders.delete(key);
		return true;
	}
}

const pins = new Holds();
const roots = new Holds();
/** The root's surface vars, and its source clip: one key each in `roots`. */
const ROOT_SURFACE = {};
const ROOT_CLIP = {};
/** Each box-flight slot's vars: one key per slot in `roots`. */
const ROOT_BOX_SLOTS = BOX_SLOT_VARS.map(() => ({}));

/** The element child `element`'s whole content is, if it is one: no other
 *  element and no text beside it. */
function soleChild(element: HTMLElement): HTMLElement | null {
	if (element.childElementCount !== 1) return null;
	for (const node of element.childNodes) {
		const isText = node.nodeType === Node.TEXT_NODE;
		if (isText && node.textContent?.trim()) return null;
	}
	const child = element.firstElementChild;
	return child instanceof HTMLElement ? child : null;
}

/**
 * The box `element` shows on screen: `element` if it paints, else the first
 * element that does down the chain of sole children (a `Morph` wrapper's
 * card, a value that is one status pill); `element` when none paints. A
 * painted element beside text or another element is only part of the
 * content, never its box. Internal: exported for its tests.
 */
export function paintedBox(element: HTMLElement): HTMLElement {
	for (let node: HTMLElement | null = element; node; node = soleChild(node)) {
		if (paints(node)) return node;
	}
	return element;
}

/** `source` if the pointer holds it, then each held element down from it:
 *  one path, as `:hover` holds an element and its ancestors. */
function heldChain(source: HTMLElement): HTMLElement[] {
	const chain: HTMLElement[] = [];
	let node: HTMLElement | undefined = source;
	while (node && isHeld(node)) {
		chain.push(node);
		node = [...node.children].find(
			(child): child is HTMLElement =>
				child instanceof HTMLElement && isHeld(child)
		);
	}
	return chain;
}

/** Pins the elements of `source` the pointer holds ({@link MORPH_PINNED}),
 *  for `holder`. Returns them. */
function pinLook(source: HTMLElement, holder: object): HTMLElement[] {
	const pinned = heldChain(source);
	for (const element of pinned) {
		element.setAttribute(MORPH_PINNED, MORPH_PINNED_HELD);
		pins.take(element, holder);
	}
	return pinned;
}

/** Lets go of the pins `holder` still holds. */
function unpin(elements: HTMLElement[], holder: object): void {
	for (const element of elements) {
		if (pins.release(element, holder))
			element.removeAttribute(MORPH_PINNED);
	}
}

function surfaceOf(element: HTMLElement): Surface {
	return surfaceIn(getComputedStyle(element));
}

function surfaceIn(style: CSSStyleDeclaration): Surface {
	return {
		background: style.backgroundColor || CLEAR,
		borderColor: style.borderTopColor || CLEAR,
		borderWidth: style.borderTopWidth || "0px",
		radius: style.borderTopLeftRadius || "0px",
	};
}

const SURFACE_KEYS = Object.keys(SURFACE_FROM_VARS) as (keyof Surface)[];

/** Writes `surface` to `properties`. */
function writeSurface(
	style: CSSStyleDeclaration,
	properties: SurfaceProperties,
	surface: Surface
): void {
	for (const key of SURFACE_KEYS)
		style.setProperty(properties[key], surface[key]);
}

/** Removes what {@link writeSurface} wrote to `properties`. */
function clearSurface(
	style: CSSStyleDeclaration,
	properties: SurfaceProperties
): void {
	for (const key of SURFACE_KEYS) style.removeProperty(properties[key]);
}

/** The surface the morph draws, from one end's to the other's, for
 *  `holder`. */
function setSurfaces(from: Surface, to: Surface, holder: object): void {
	const root = document.documentElement.style;
	writeSurface(root, SURFACE_FROM_VARS, from);
	writeSurface(root, SURFACE_TO_VARS, to);
	roots.take(ROOT_SURFACE, holder);
}

/** Clips the `jf-morph-source` snapshot to `element`'s on-screen part (a
 *  snapshot ignores its ancestors' clipping), for `holder`. */
function clipSource(element: HTMLElement, holder: object): void {
	document.documentElement.style.setProperty(
		SOURCE_CLIP_VAR,
		clipInset(element)
	);
	roots.take(ROOT_CLIP, holder);
}

/** Box-flight slot `slot`'s surface, from one end's box to the other's,
 *  for `holder`. */
function setBoxSurfaces(
	slot: number,
	from: Surface,
	to: Surface,
	holder: object
): void {
	const root = document.documentElement.style;
	writeSurface(root, BOX_SLOT_VARS[slot].from, from);
	writeSurface(root, BOX_SLOT_VARS[slot].to, to);
	roots.take(ROOT_BOX_SLOTS[slot], holder);
}

/** Clears the surface vars, the box-flight vars and the source clip
 *  `holder` still holds. */
function clearRoot(holder: object): void {
	const root = document.documentElement.style;
	if (roots.release(ROOT_SURFACE, holder)) {
		clearSurface(root, SURFACE_FROM_VARS);
		clearSurface(root, SURFACE_TO_VARS);
	}
	ROOT_BOX_SLOTS.forEach((key, slot) => {
		if (!roots.release(key, holder)) return;
		clearSurface(root, BOX_SLOT_VARS[slot].from);
		clearSurface(root, BOX_SLOT_VARS[slot].to);
	});
	if (roots.release(ROOT_CLIP, holder)) {
		document.documentElement.style.removeProperty(SOURCE_CLIP_VAR);
	}
}

/**
 * A content-free box exactly over the on-screen part of `at`'s border box (a
 * row scrolled sideways starts from what is visible, not its full width). It
 * carries geometry only and paints nothing: an open's ghost is in the frame
 * the browser keeps on screen while the update renders, so a painted surface
 * would cover its source's text there; the morph's surface is drawn on the
 * image pair instead, and the ghost's own snapshot is hidden.
 */
function placeGhost(at: HTMLElement): HTMLElement {
	const box = visibleRect(at);
	const ghost = document.createElement("div");
	ghost.setAttribute(MORPH_GHOST, "");
	ghost.setAttribute("aria-hidden", "true");
	for (const [key, name] of Object.entries(GHOST_GEOMETRY_VARS)) {
		ghost.style.setProperty(
			name,
			`${box[key as keyof typeof GHOST_GEOMETRY_VARS]}px`
		);
	}
	document.body.append(ghost);
	return ghost;
}

/** The surface a card fades out to over a trigger that has none. */
function faded(surface: Surface): Surface {
	return { ...surface, background: CLEAR, borderColor: CLEAR };
}

/**
 * The handoff a closing overlay offers: an overlay that opens inside the
 * same transition calls this and, when it returns a claim, opens through
 * {@link joinHandoff}; the closer then names the NEW overlay instead of
 * morphing back to its own source, so the picked palette row grows into
 * the sheet it opened. The claim carries what the closer handed on.
 */
export function claimHandoff(target: () => HTMLElement | null): Claim | null {
	const scope = runningScope();
	if (!scope) return null;
	const handoff = handoffOf(scope);
	if (!handoff.open || handoff.claimedTarget) return null;
	handoff.claimedTarget = target;
	return { handedOn: handoff.handedOn };
}

/**
 * Opens as the target of a handoff this overlay claimed: `update` joins the
 * closer's transition, and the closer names the target. Its look joins
 * after the closer's and wins, so the target decides (the box look).
 */
export function joinHandoff(update: () => unknown): Promise<void> {
	return viewTransition(
		(scope) => {
			scope.kind(lookKind("box"));
			return update();
		},
		{ kind: "morph" }
	);
}

type MorphOptions = {
	from: HTMLElement | null;
	to: () => HTMLElement | null;
	update: () => unknown;
	/** An overlay opening (the default) or closing. A close offers its
	 *  handoff (see {@link claimHandoff}). */
	direction?: "open" | "close";
	/** A close's source and opener, handed to the overlay that claims its
	 *  handoff. */
	handsOn?: HandedOn;
};

/** Animating, and not joining a running transition: its old snapshot is
 *  already taken, so a ghost would never be in it. */
function canDrawSurface(): boolean {
	return canAnimate() && !isTransitionRunning();
}

/** A close's target, read once as the close is asked for; an open's is
 *  read at {@link MorphEnds.resolve}. */
function closeTargetOf(options: MorphOptions): HTMLElement | null {
	return options.direction === "close" ? options.to() : null;
}

/**
 * One morph's ends: the target, resolved once, and, for the box look, the
 * surface drawn between them. An open resolves its target just before the
 * new snapshot (the update renders it). A close resolves it before the
 * transition starts: which of its values fly is decided then, against that
 * same target (it is on screen already).
 */
class MorphEnds {
	target: HTMLElement | null = null;
	/** Stands in for the trigger: in the old snapshot on open, the new on close. */
	ghost: HTMLElement | null = null;
	/** A close target with a container, named `jf-morph-source` on its
	 *  {@link paintedBox}: its content fades in where it is. */
	fadingIn: HTMLElement | null = null;
	/** An open source with a container, named `jf-morph-source` on its
	 *  {@link paintedBox}: hidden while open, its content fades out where it
	 *  is. */
	readonly fadingOut: HTMLElement | null = null;
	/** A surface may be drawn ({@link canDrawSurface}, with a source). An
	 *  open also needs the box look; a close learns its look from its
	 *  target, at {@link resolve}. */
	readonly isSurface: boolean;
	/** The overlay's marked scrim fades with this morph, whatever its look
	 *  and with or without a source: the overlay's own fade is off under a
	 *  morph. */
	private readonly fadesScrim: boolean;
	readonly isClosing: boolean;
	/** The surface is drawn (`morph-grow` or `morph-shrink`): known once
	 *  {@link resolve} ran. Box flights draw theirs only then. */
	private drawsSurface = false;
	/** A close whose handoff was claimed: its target is the claimant. Known
	 *  once {@link resolve} ran. */
	private isHandedOff = false;
	/** An open's look, from its source. */
	readonly openLook: MorphLook;
	private readonly fromSurface: Surface | undefined;
	/** What {@link pinLook} pinned; let go in {@link cleanUp}. */
	private readonly pinned: HTMLElement[] = [];
	private targetValues: Map<string, HTMLElement> | undefined;
	private closeValues: Map<string, HTMLElement> | undefined;
	private readonly options: MorphOptions;

	constructor(options: MorphOptions) {
		this.options = options;
		const { from } = options;
		this.isClosing = options.direction === "close";
		this.target = closeTargetOf(options);
		this.openLook = this.isClosing ? "box" : lookOf(from);
		this.fadesScrim = canDrawSurface();
		this.isSurface =
			this.openLook === "box" && this.fadesScrim && from !== null;
		if (!this.isSurface || !from) return;
		const box = paintedBox(from);
		if (this.isClosing) {
			this.fromSurface = surfaceOf(box);
			return;
		}
		const isContainer = hasContainer(from);
		// Pinned first: the surface then starts from the held look.
		this.pinned = pinLook(from, this);
		if (isContainer) {
			this.fadingOut = box;
			this.fromSurface = surfaceOf(box);
			clipSource(box, this);
		}
		this.ghost = placeGhost(box);
	}

	/** What carries `jf-morph` in the new snapshot. */
	resolve(scope: TransitionScope): HTMLElement | null {
		if (this.isClosing) {
			const claimant = handoffOf(scope).claimedTarget?.() ?? null;
			return claimant
				? this.handOff(scope, claimant)
				: this.resolveClose(scope, this.target);
		}
		this.target = this.options.to();
		return this.target && this.isSurface
			? this.grow(scope, this.target)
			: this.target;
	}

	/** A close takes its look from what it closes into. */
	private resolveClose(
		scope: TransitionScope,
		target: HTMLElement | null
	): HTMLElement | null {
		const look = lookOf(target);
		scope.kind(lookKind(look));
		return target && this.fromSurface && look === "box"
			? this.shrink(scope, target, this.fromSurface)
			: target;
	}

	/** Open: the surface goes from the source's (or, without a container,
	 *  the target's own) to the target's. */
	private grow(scope: TransitionScope, target: HTMLElement): HTMLElement {
		const toSurface = surfaceOf(paintedBox(target));
		setSurfaces(this.fromSurface ?? toSurface, toSurface, this);
		this.drawsSurface = true;
		scope.kind("morph-grow");
		return target;
	}

	/**
	 * Handed off: the claimant's look wins (the box look, `joinHandoff`), and
	 * the closer's box (its card, or the picked row) grows into the
	 * claimant's as on an open, the surface carrying the motion. The old
	 * snapshot is a real overlay, not a ghost, so it fades out fast rather
	 * than hiding (`morph-handoff`). A closer that joined a running
	 * transition has no surface to start from: the claimant takes the name
	 * as is.
	 */
	private handOff(
		scope: TransitionScope,
		claimant: HTMLElement
	): HTMLElement {
		this.target = claimant;
		this.isHandedOff = true;
		if (!this.fromSurface) return claimant;
		setSurfaces(this.fromSurface, surfaceOf(paintedBox(claimant)), this);
		this.drawsSurface = true;
		scope.kind("morph-handoff");
		return claimant;
	}

	/** Close: the card shrinks into the target's box and surface, or, over
	 *  a target without a container, to its box while it fades. */
	private shrink(
		scope: TransitionScope,
		target: HTMLElement,
		fromSurface: Surface
	): HTMLElement {
		const isContainer = hasContainer(target);
		const box = paintedBox(target);
		const toSurface = isContainer ? surfaceOf(box) : faded(fromSurface);
		setSurfaces(fromSurface, toSurface, this);
		this.ghost = placeGhost(box);
		this.fadingIn = isContainer ? box : null;
		if (isContainer) clipSource(box, this);
		this.drawsSurface = true;
		scope.kind("morph-shrink");
		return this.ghost;
	}

	/** Whether a close's value with `key` has somewhere to land: the row it
	 *  closes into shows that key on screen. One that has none is not named,
	 *  so it shrinks with the card rather than lingering where it was. An
	 *  open's values always fly: its target is not rendered yet. */
	landsOnClose(key: string): boolean {
		if (!this.isClosing) return true;
		this.closeValues ??= keyedValues(this.target, true);
		return fullyVisibleOrNull(this.closeValues.get(key) ?? null) !== null;
	}

	/** The target's value with `key`, if any, and only if all of it is on
	 *  screen (a row's cell scrolled out of its table must not take one). */
	valueFor(key: string): HTMLElement | null {
		this.targetValues ??= keyedValues(this.target, true);
		return fullyVisibleOrNull(this.targetValues.get(key) ?? null);
	}

	/** Where the source's title lands: the target's value with the title's
	 *  key (a sheet's first-name half), else the target's title. */
	titleTarget(title: HTMLElement): HTMLElement | null {
		const key = title.getAttribute(MORPH_TITLE) ?? "";
		return (
			(key === "" ? null : this.valueFor(key)) ??
			fullyVisibleOrNull(titleIn(this.target))
		);
	}

	/** The scrim that fades out with a close, in the old snapshot. */
	closingScrim(): HTMLElement | null {
		return this.isClosing && this.fadesScrim
			? scrimOf(this.options.from)
			: null;
	}

	/** The scrim that fades in with an open, in the new snapshot; on a
	 *  handoff the claimant's, so one scrim runs through. */
	openingScrim(): HTMLElement | null {
		const isOpening = !this.isClosing || this.isHandedOff;
		return isOpening && this.fadesScrim ? scrimOf(this.target) : null;
	}

	/**
	 * Turns the paired `flights` whose ends paint a field box into box
	 * flights, one slot each while slots last: the slot's surfaces on
	 * `<html>`, its classes on the new end. Runs after the new end is named,
	 * just before the new snapshot: nothing changes on the page before the
	 * old one. Only with the morph's own surface (the same kinds draw both).
	 */
	flyBoxes(flights: PartFlight[]): void {
		if (!this.drawsSurface) return;
		let slot = 0;
		for (const flight of flights) {
			if (slot === MORPH_BOX_SLOTS) return;
			const box = flight.boxSurfaces();
			if (!box) continue;
			setBoxSurfaces(slot, box.from, box.to, this);
			box.target.style.setProperty(
				"view-transition-class",
				`${PART_CLASS} ${BOX_CLASS} ${boxSlotClass(slot)}`
			);
			slot += 1;
		}
	}

	/** An open's ghost leaves before the new snapshot: the target takes over. */
	removeOpenGhost(): void {
		if (!this.isClosing) this.ghost?.remove();
	}

	/** Lets go of what this morph still holds (see {@link Holds}). */
	cleanUp(): void {
		this.ghost?.remove();
		unpin(this.pinned, this);
		clearRoot(this);
	}
}

/** The marked scrim of the overlay around `card`: the backdrop beside the
 *  card's positioner, in the overlay's portal. */
function scrimOf(card: HTMLElement | null): HTMLElement | null {
	for (
		let ancestor = card?.parentElement;
		ancestor && ancestor !== document.body;
		ancestor = ancestor.parentElement
	) {
		const scrim = ancestor.querySelector<HTMLElement>(
			`:scope > [${MORPH_SCRIM}]`
		);
		if (scrim) return scrim;
	}
	return null;
}

/**
 * One keyed value's flight (`jf-morph-part-<key>`). At each end it names the
 * box the value paints ({@link valueBox}), else the value: the group then
 * moves and sizes the box itself, not a cell around it (a row's score field beside its key hint). A pair
 * with a box at either end takes the box flight ({@link MorphEnds.flyBoxes}):
 * one box is enough, as for the card, whose surface fades out over an end
 * without one. Text pairs keep the text flight.
 */
class PartFlight {
	readonly name: PartName;
	/** What the flight names in the old snapshot. */
	readonly from: HTMLElement;
	/** What it names in the new one, once {@link resolve} found it. */
	target: HTMLElement | null = null;
	/** The source's box surface, read before the transition and at rest
	 *  (Chrome drops the hover as it starts; the old snapshot has none). */
	private readonly fromSurface: Surface | undefined;
	private toBox: HTMLElement | null = null;
	private readonly key: string;

	constructor(key: string, value: HTMLElement) {
		this.key = key;
		this.name = partName(key);
		const box = valueBox(value);
		this.from = box ?? value;
		this.fromSurface = box ? atRest(box, surfaceIn) : undefined;
	}

	/** The new end: the target's value with this key, or its box. */
	resolve(ends: MorphEnds): HTMLElement | null {
		const value = ends.valueFor(this.key);
		this.toBox = value ? valueBox(value) : null;
		this.target = this.toBox ?? value;
		return this.target;
	}

	/** The box flight's new end and its surfaces, from and to, if the pair
	 *  has a box and its new end took the name (a duplicate is refused). */
	boxSurfaces(): { target: HTMLElement; from: Surface; to: Surface } | null {
		const { target } = this;
		const isNamed =
			target?.style.getPropertyValue("view-transition-name") ===
			this.name;
		if (!target || !isNamed) return null;
		const to = this.toBox ? surfaceOf(this.toBox) : undefined;
		if (this.fromSurface) {
			return {
				target,
				from: this.fromSurface,
				to: to ?? faded(this.fromSurface),
			};
		}
		return to ? { target, from: faded(to), to } : null;
	}
}

/**
 * The box a keyed value paints, if any: its field's box ({@link fieldBoxIn},
 * the value itself included), else the {@link paintedBox} the whole value
 * is when that paints (a status pill). A pill beside other content is part
 * of the value and has no box of its own: the value flies as text.
 */
function valueBox(value: HTMLElement): HTMLElement | null {
	const field = fieldBoxIn(value, true);
	if (field) return field;
	const box = paintedBox(value);
	return paints(box) ? box : null;
}

/** The source's values that fly: every keyed one fully on screen. */
function flyingValues(from: HTMLElement | null, ends: MorphEnds): PartFlight[] {
	// A source without a container stays live: nothing leaves it.
	const hasFlights = ends.isClosing || ends.fadingOut !== null;
	const flying: PartFlight[] = [];
	if (!from || !hasFlights) return flying;
	for (const [key, value] of keyedValues(from)) {
		if (isFullyVisible(value) && ends.landsOnClose(key))
			flying.push(new PartFlight(key, value));
	}
	return flying;
}

/**
 * The overlays shown under the one this morph opens or closes (the closing
 * one holds the close's source). Each steps back or forward in the update,
 * where its stylesheet runs no transition of its own under a morph, so each
 * is named in both snapshots and the browser moves it: a close's target
 * inside one is then measured where it will rest. None in a morph that
 * joins a running transition: its old snapshot is already taken, and a
 * group in the new one only would fade the overlay in from nothing.
 */
function stackedUnder(options: MorphOptions): HTMLElement[] {
	if (!canDrawSurface()) return [];
	const closing = options.direction === "close" ? options.from : null;
	return [
		...document.querySelectorAll<HTMLElement>(`[${MORPH_LAYER}]`),
	].filter((layer) => !closing || !layer.contains(closing));
}

/** Opens a close's handoff, with what it hands on. */
function offer(handoff: Handoff, options: MorphOptions): void {
	handoff.open = true;
	handoff.handedOn = options.handsOn;
}

const cleanUpEnds = Result.fromThrowable((ends: MorphEnds) => {
	ends.cleanUp();
});

/**
 * Moves the one morph name (`jf-morph`) from `from` (old snapshot) to `to()`
 * (new snapshot), and a marked title inside each (`jf-morph-title`) with it.
 * Never both at once: a duplicate name makes the browser skip the whole
 * transition. A `null` end scales from or to the page centre (pure CSS, see
 * viewTransition.scss).
 *
 * The look comes from the trigger's end ({@link lookOf}): the source on
 * open, the close target on close. A text field scales (`morph-scale`);
 * anything else takes the box look (`morph-box`), which draws a surface
 * between the ends (`morph-grow` on open, `morph-shrink` on close). A ghost
 * of the trigger's box ({@link MORPH_GHOST}, geometry only) carries the
 * morph's name on the trigger's side. A source with a container
 * ({@link hasContainer}) gives the surface its start: it grows from the
 * source's box and colours into the target, while the source itself, fill
 * and all (`jf-morph-source`), fades in place under it; a source without
 * one stays live and the target grows out of its box. A close is the reverse. Each keyed
 * value of the source (a table cell) flies into the target's value with the
 * same key (a sheet field), each named by its key (`jf-morph-part-<key>`,
 * class `jf-morph-part`). The elements of an open's source the pointer
 * holds keep their hover look for the transition ({@link MORPH_PINNED}).
 * Each end's surface, ghost and `jf-morph-source` sit on its
 * {@link paintedBox} (a bare `Morph` wrapper's card).
 *
 * A closing overlay (`direction: "close"`) offers a handoff (see
 * {@link claimHandoff}). A
 * handed-off target's look joins later and wins, so the target decides.
 */
export function morph(options: MorphOptions): Promise<{ handedOff: boolean }> {
	let captured: Handoff | undefined;
	const stacked = stackedUnder(options);
	const ends = new MorphEnds(options);
	const from = ends.ghost && !ends.isClosing ? ends.ghost : options.from;
	const title = fullyVisibleOrNull(titleIn(options.from));
	const flights = flyingValues(options.from, ends);
	const done = moveName({
		from,
		to: (scope) => ends.resolve(scope),
		name: "jf-morph",
		also: [
			{
				from: ends.fadingOut,
				to: () => ends.fadingIn,
				name: "jf-morph-source",
			},
			{
				from: ends.closingScrim(),
				to: () => ends.openingScrim(),
				name: "jf-morph-scrim",
			},
			{
				from: title,
				to: () => (title ? ends.titleTarget(title) : null),
				name: "jf-morph-title",
			},
			...flights.map((flight) => ({
				from: flight.from,
				to: () => flight.resolve(ends),
				name: flight.name,
			})),
			...stacked.map((layer, index) => ({
				from: layer,
				to: () => layer,
				name: stackedName(index),
			})),
		],
		kind: "morph",
		update: (scope) => {
			ends.removeOpenGhost();
			// After the names above: moveName registered its own first.
			scope.beforeSnapshot(() => {
				ends.flyBoxes(flights);
			});
			captured = handoffOf(scope);
			if (ends.isClosing) offer(captured, options);
			// A close's look waits for its target (resolve).
			if (!ends.isClosing) scope.kind(lookKind(ends.openLook));
			return options.update();
		},
	});
	// Offered when the close is asked for, not when its update runs: an
	// overlay opened right after it, in the same task, must find it open.
	const session = runningScope();
	if (ends.isClosing && session) offer(handoffOf(session), options);
	return done.then(() => {
		const cleaned = cleanUpEnds(ends);
		// The caller's own follow-up (a presence's close) must still run.
		if (cleaned.isErr()) surfaceError(cleaned.error);
		return {
			// Read after the transition: a closer whose name was claimed must
			// not restore focus over the overlay that took over.
			handedOff: Boolean(ends.isClosing && captured?.claimedTarget),
		};
	});
}
