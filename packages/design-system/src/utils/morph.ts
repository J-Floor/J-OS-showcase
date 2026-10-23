/* eslint-disable max-lines -- one cohesive module: a morph's ends, its surface, its source and its flights decide together what each snapshot holds */
import {
	ENTITY_SURFACE,
	MORPH_TITLE,
	keyedValues,
	titleIn,
} from "./morphPairing.ts";
import {
	type TransitionScope,
	canAnimate,
	isTransitionRunning,
	moveName,
	partName,
	runningScope,
	surfaceError,
} from "./viewTransition.ts";
import {
	clearSourceClip,
	clipSource,
	isFullyVisible,
	fullyVisibleOrNull,
	visibleRect,
} from "./visibleArea.ts";

/** The stand-in box a surface morph puts where its trigger is. */
export const MORPH_GHOST = "data-morph-ghost";

/**
 * An open's source, and its cells that paint their own fill, keep the look
 * they had when the morph started: Chrome drops the page's hover state as a
 * View Transition starts, so the row would lose its hover fill in the live
 * frame and in the old snapshot. The colours are value-only vars it carries
 * inline (viewTransition.scss applies them).
 */
const MORPH_PINNED = "data-morph-pinned";

/**
 * A container end without its own surface (fill, border, shadow, outline),
 * for the snapshot it is `jf-morph-source` in: the ghost carries that
 * surface into the morph, so the snapshot holds only the content (text,
 * icons) that fades where it is. The ghost sits exactly over it in the one
 * live frame, so nothing flashes. Covers the same cells as the pin.
 */
export const MORPH_STRIPPED = "data-morph-stripped";

/**
 * An overlay's scrim that fades with the overlay's morph (`jf-morph-scrim`),
 * set by the overlay on its backdrop. Left to its own CSS transition, the
 * scrim fades while the browser captures the page and paints nothing, so
 * the first painted frame shows it almost opaque: the whole page darkens at
 * once.
 */
export const MORPH_SCRIM = "data-morph-scrim";

/**
 * Held while a stripped element gets its surface back. Its own CSS
 * transition would otherwise fade the surface in after the ghost has gone:
 * a filled button flashed empty, then filled again.
 */
const MORPH_SETTLING = "data-morph-settling";

const PIN_VARS = ["--jf-morph-pin-bg", "--jf-morph-pin-border"] as const;

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
type Surface = {
	background: string;
	borderColor: string;
	borderWidth: string;
	radius: string;
};

const SURFACE_VARS: Record<keyof Surface, string> = {
	background: "background",
	borderColor: "border-color",
	borderWidth: "border-width",
	radius: "radius",
};

type Handoff = { claimedTarget?: () => HTMLElement | null; open: boolean };

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

function isHeld(element: HTMLElement): boolean {
	try {
		return element.matches(":hover, :active");
	} catch {
		return false;
	}
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
	copy.removeAttribute(MORPH_STRIPPED);
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

/** A field root paints on the box around its control (the DS Field's input
 *  wrapper), not on itself: the field is that box. */
function fieldBoxPaints(root: HTMLElement): boolean {
	for (
		let node = textControlOf(root);
		node && node !== root;
		node = node.parentElement
	) {
		if (paints(node)) return true;
	}
	return false;
}

/**
 * True when the element is a surface of its own: a table row or an entity
 * element, anything that paints a background, a border or a shadow at rest,
 * or a field root whose control's box does. A morph out of one grows that
 * surface into the target; one out of an icon button or a bare glyph leaves
 * it in place and grows the target out of its box. Internal: exported for
 * its tests.
 */
export function hasContainer(element: HTMLElement): boolean {
	return (
		element.matches(ENTITY_SURFACE) ||
		paints(element) ||
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

/** The four border colours, top, right, bottom, left. */
function borderColors(style: CSSStyleDeclaration): string {
	return BORDER_SIDES.map((side) =>
		style.getPropertyValue(`border-${side}-color`)
	).join(" ");
}

/**
 * Which morph holds each piece of shared state it sets: an element's strip or
 * pin, the root's surface vars, the source clip. A morph that starts while
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

	/** Forgets `key`, whoever holds it. */
	forget(key: object): void {
		this.holders.delete(key);
	}

	/** True, and forgotten, if `holder` still holds `key`. */
	release(key: object, holder: object): boolean {
		if (this.holders.get(key) !== holder) return false;
		this.holders.delete(key);
		return true;
	}
}

const pins = new Holds();
const strips = new Holds();
const roots = new Holds();
/** The root's surface vars, and its source clip: one key each in `roots`. */
const ROOT_SURFACE = {};
const ROOT_CLIP = {};

function pinOne(element: HTMLElement, style: CSSStyleDeclaration): void {
	// Read before the attribute is set: the style is live, and the pin rule
	// would apply before its vars exist.
	const background = style.backgroundColor || CLEAR;
	const border = borderColors(style);
	element.style.setProperty(PIN_VARS[0], background);
	element.style.setProperty(PIN_VARS[1], border);
	element.setAttribute(MORPH_PINNED, "");
}

/** `element` and its children that paint their own fill (a sticky cell
 *  mirrors the row's hover fill). */
function surfaceLayers(element: HTMLElement): HTMLElement[] {
	const layers = [element];
	for (const child of element.children) {
		if (
			!(child instanceof HTMLElement) ||
			isClear(getComputedStyle(child).backgroundColor)
		) {
			continue;
		}
		layers.push(child);
	}
	return layers;
}

/** Pins the look of `source`'s {@link surfaceLayers} for `holder`. Returns
 *  them. */
function pinLook(source: HTMLElement, holder: object): HTMLElement[] {
	const pinned = surfaceLayers(source);
	for (const element of pinned) {
		pinOne(element, getComputedStyle(element));
		pins.take(element, holder);
	}
	return pinned;
}

/** Lets go of the pins `holder` still holds. */
function unpin(elements: HTMLElement[], holder: object): void {
	for (const element of elements) {
		if (!pins.release(element, holder)) continue;
		element.removeAttribute(MORPH_PINNED);
		for (const name of PIN_VARS) element.style.removeProperty(name);
	}
}

/** Gives the elements `holder` still holds stripped their surface back. */
function unstrip(stripped: HTMLElement[], holder: object): void {
	restoreSurface(
		stripped.filter((element) => strips.release(element, holder))
	);
}

/**
 * Takes back a strip an earlier morph still holds on `element` or its
 * children (a row clicked again as its sheet closes into it), so the new
 * morph reads the element's own surface, then strips it for itself.
 */
function reclaim(element: HTMLElement | null): void {
	if (!element) return;
	const held = [element, ...element.children].filter(
		(layer): layer is HTMLElement =>
			layer instanceof HTMLElement && layer.hasAttribute(MORPH_STRIPPED)
	);
	for (const layer of held) strips.forget(layer);
	restoreSurface(held);
}

/** Gives `elements` their surface back at once, without their own
 *  transition ({@link MORPH_SETTLING}). */
function restoreSurface(elements: HTMLElement[]): void {
	for (const element of elements) {
		element.setAttribute(MORPH_SETTLING, "");
		element.removeAttribute(MORPH_STRIPPED);
	}
	// Reading the style applies the surface now, while no transition runs.
	for (const element of elements)
		getComputedStyle(element).getPropertyValue("background-color");
	for (const element of elements) element.removeAttribute(MORPH_SETTLING);
}

/** Strips the surface off `element`'s {@link surfaceLayers} for `holder`.
 *  Returns them. */
function strip(element: HTMLElement, holder: object): HTMLElement[] {
	const stripped = surfaceLayers(element);
	for (const layer of stripped) {
		layer.setAttribute(MORPH_STRIPPED, "");
		strips.take(layer, holder);
	}
	return stripped;
}

function surfaceOf(element: HTMLElement): Surface {
	const style = getComputedStyle(element);
	return {
		background: style.backgroundColor || CLEAR,
		borderColor: style.borderTopColor || CLEAR,
		borderWidth: style.borderTopWidth || "0px",
		radius: style.borderTopLeftRadius || "0px",
	};
}

const SURFACE_KEYS = Object.keys(SURFACE_VARS) as (keyof Surface)[];

/** Writes `surface` as the vars `${prefix}-background` and so on. */
function writeSurface(
	style: CSSStyleDeclaration,
	prefix: string,
	surface: Surface
): void {
	for (const key of SURFACE_KEYS) {
		style.setProperty(`${prefix}-${SURFACE_VARS[key]}`, surface[key]);
	}
}

/** Removes what {@link writeSurface} wrote under `prefix`. */
function clearSurface(style: CSSStyleDeclaration, prefix: string): void {
	for (const key of SURFACE_KEYS) {
		style.removeProperty(`${prefix}-${SURFACE_VARS[key]}`);
	}
}

const FROM_VARS = "--jf-morph-from";
const TO_VARS = "--jf-morph-to";

/** The surface the morph draws, from one end's to the other's, for
 *  `holder`. */
function setSurfaces(from: Surface, to: Surface, holder: object): void {
	const root = document.documentElement.style;
	writeSurface(root, FROM_VARS, from);
	writeSurface(root, TO_VARS, to);
	roots.take(ROOT_SURFACE, holder);
}

/** Clips the `jf-morph-source` snapshot to `element`, for `holder`. */
function clipSourceFor(element: HTMLElement, holder: object): void {
	clipSource(element);
	roots.take(ROOT_CLIP, holder);
}

/** Clears the surface vars and the source clip `holder` still holds. */
function clearRoot(holder: object): void {
	if (roots.release(ROOT_SURFACE, holder)) {
		const root = document.documentElement.style;
		clearSurface(root, FROM_VARS);
		clearSurface(root, TO_VARS);
	}
	if (roots.release(ROOT_CLIP, holder)) clearSourceClip();
}

/** A content-free box exactly over the on-screen part of `at`'s border box
 *  (a row scrolled sideways starts from what is visible, not its full
 *  width), painting `surface`. */
function placeGhost(at: HTMLElement, surface: Surface): HTMLElement {
	const box = visibleRect(at);
	const ghost = document.createElement("div");
	ghost.setAttribute(MORPH_GHOST, "");
	ghost.setAttribute("aria-hidden", "true");
	const geometry = {
		top: box.top,
		left: box.left,
		width: box.width,
		height: box.height,
	};
	for (const [key, value] of Object.entries(geometry)) {
		ghost.style.setProperty(`--jf-ghost-${key}`, `${value}px`);
	}
	writeSurface(ghost.style, "--jf-ghost", surface);
	document.body.append(ghost);
	return ghost;
}

/** The surface a card fades out to over a trigger that has none. */
function faded(surface: Surface): Surface {
	return { ...surface, background: CLEAR, borderColor: CLEAR };
}

/**
 * The handoff a closing overlay offers: an overlay that opens inside the
 * same transition calls this and, when it returns true, passes
 * `claimed: true` to {@link morph}; the closer then names the NEW overlay
 * instead of morphing back to its own source, so the picked palette row grows
 * into the sheet it opened.
 */
export function claimHandoff(target: () => HTMLElement | null): boolean {
	const scope = runningScope();
	if (!scope) return false;
	const handoff = handoffOf(scope);
	if (!handoff.open || handoff.claimedTarget) return false;
	handoff.claimedTarget = target;
	return true;
}

type MorphOptions = {
	from: HTMLElement | null;
	to: () => HTMLElement | null;
	update: () => unknown;
	/** An overlay opening (the default) or closing. A close offers its
	 *  handoff (see {@link claimHandoff}). */
	direction?: "open" | "close";
	/** This opener claimed a handoff; the closer names its target. */
	claimed?: boolean;
};

const CLEAR_SURFACE: Surface = {
	background: CLEAR,
	borderColor: CLEAR,
	borderWidth: "0px",
	radius: "0px",
};

/** Animating, not a claimed opener, and not joining a running transition:
 *  its old snapshot is already taken, so a ghost would never be in it. */
function canDrawSurface(options: MorphOptions): boolean {
	return canAnimate() && options.claimed !== true && !isTransitionRunning();
}

/**
 * One morph's ends: the target, resolved once just before the new snapshot,
 * and, for the box look, the surface drawn between them.
 */
class MorphEnds {
	target: HTMLElement | null = null;
	/** Stands in for the trigger: in the old snapshot on open, the new on close. */
	ghost: HTMLElement | null = null;
	/** A close target with a container, named `jf-morph-source`: its content
	 *  fades in where it is. */
	closeSource: HTMLElement | null = null;
	/** An open source with a container, named `jf-morph-source`: hidden while
	 *  open, its content fades out where it is. */
	readonly openSource: HTMLElement | null = null;
	/** A surface may be drawn ({@link canDrawSurface}, with a source). An
	 *  open also needs the box look; a close learns its look from its
	 *  target, at {@link resolve}. */
	readonly isSurface: boolean;
	readonly isClosing: boolean;
	/** An open's look, from its source. */
	readonly openLook: MorphLook;
	private readonly fromSurface: Surface | undefined;
	/** What {@link pinLook} pinned; let go in {@link cleanUp}. */
	private readonly pinned: HTMLElement[] = [];
	/** What {@link strip} stripped; let go in {@link cleanUp}. */
	private stripped: HTMLElement[] = [];
	private targetValues: Map<string, HTMLElement> | undefined;
	private closeValues: Map<string, HTMLElement> | undefined;
	private readonly options: MorphOptions;

	constructor(options: MorphOptions) {
		this.options = options;
		const { from } = options;
		this.isClosing = options.direction === "close";
		// Before anything reads its look.
		reclaim(from);
		this.openLook = this.isClosing ? "box" : lookOf(from);
		this.isSurface =
			this.openLook === "box" && canDrawSurface(options) && from !== null;
		if (!this.isSurface || !from) return;
		if (this.isClosing) {
			this.fromSurface = surfaceOf(from);
			return;
		}
		const isContainer = hasContainer(from);
		// Pinned first: the surface then starts from the pinned colours.
		this.pinned = pinLook(from, this);
		if (isContainer) {
			this.openSource = from;
			this.fromSurface = surfaceOf(from);
			clipSourceFor(from, this);
		}
		this.ghost = placeGhost(from, this.fromSurface ?? CLEAR_SURFACE);
		// Last: the pin and the surface read the source's live style.
		if (isContainer) this.stripped = strip(from, this);
	}

	/** What carries `jf-morph` in the new snapshot. */
	resolve(scope: TransitionScope): HTMLElement | null {
		const { options } = this;
		if (options.claimed) return null;
		const claimed = this.isClosing
			? handoffOf(scope).claimedTarget
			: undefined;
		this.target = claimed?.() ?? options.to();
		// Handed off: the claimant's look wins, and the picked row grows
		// into the new overlay as is.
		if (claimed) return this.target;
		if (this.isClosing) return this.resolveClose(scope, this.target);
		return this.target && this.isSurface
			? this.grow(scope, this.target)
			: this.target;
	}

	/** A close takes its look from what it closes into. */
	private resolveClose(
		scope: TransitionScope,
		target: HTMLElement | null
	): HTMLElement | null {
		// Before anything reads its look: an open still finishing may strip it.
		reclaim(target);
		const look = lookOf(target);
		scope.kind(lookKind(look));
		return target && this.fromSurface && look === "box"
			? this.shrink(scope, target, this.fromSurface)
			: target;
	}

	/** Open: the surface goes from the source's (or, without a container,
	 *  the target's own) to the target's. */
	private grow(scope: TransitionScope, target: HTMLElement): HTMLElement {
		const toSurface = surfaceOf(target);
		setSurfaces(this.fromSurface ?? toSurface, toSurface, this);
		scope.kind("morph-grow");
		return target;
	}

	/** Close: the card shrinks into a ghost of the target's surface, or, over
	 *  a target without a container, to its box while it fades. */
	private shrink(
		scope: TransitionScope,
		target: HTMLElement,
		fromSurface: Surface
	): HTMLElement {
		const isContainer = hasContainer(target);
		const toSurface = isContainer ? surfaceOf(target) : faded(fromSurface);
		setSurfaces(fromSurface, toSurface, this);
		this.ghost = placeGhost(target, toSurface);
		this.closeSource = isContainer ? target : null;
		if (isContainer) {
			clipSourceFor(target, this);
			// After the surface is read: the ghost brings it back in.
			this.stripped = strip(target, this);
		}
		scope.kind("morph-shrink");
		return this.ghost;
	}

	/** The target's value with `key`, if any, and only if all of it is on
	 *  screen (a row's cell scrolled out of its table must not take one). */
	/** Whether a close's value with `key` has somewhere to land: the row it
	 *  closes into shows that key on screen. One that has none is not named,
	 *  so it shrinks with the card rather than lingering where it was. An
	 *  open's values always fly: its target is not rendered yet. */
	landsOnClose(key: string): boolean {
		if (!this.isClosing) return true;
		this.closeValues ??= keyedValues(this.options.to(), true);
		return fullyVisibleOrNull(this.closeValues.get(key) ?? null) !== null;
	}

	valueFor(key: string): HTMLElement | null {
		this.targetValues ??= keyedValues(this.target, true);
		return fullyVisibleOrNull(this.targetValues.get(key) ?? null);
	}

	/** Where the source's title lands: the target's value with the title's
	 *  key (a person sheet's first-name half), else the target's title. */
	titleTarget(title: HTMLElement): HTMLElement | null {
		const key = title.getAttribute(MORPH_TITLE) ?? "";
		return (
			(key === "" ? null : this.valueFor(key)) ??
			fullyVisibleOrNull(titleIn(this.target))
		);
	}

	/** The scrim that fades out with a box-look close, in the old snapshot. */
	closingScrim(): HTMLElement | null {
		return this.isClosing && this.isSurface
			? scrimOf(this.options.from)
			: null;
	}

	/** The scrim that fades in with a box-look open, in the new snapshot. */
	openingScrim(): HTMLElement | null {
		return !this.isClosing && this.isSurface ? scrimOf(this.target) : null;
	}

	/** An open's ghost leaves before the new snapshot: the target takes over. */
	removeOpenGhost(): void {
		if (!this.isClosing) this.ghost?.remove();
	}

	/** Lets go of what this morph still holds (see {@link Holds}). */
	cleanUp(): void {
		this.ghost?.remove();
		unpin(this.pinned, this);
		unstrip(this.stripped, this);
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

/** The source's values that fly: every keyed one fully on screen. */
function flyingValues(
	from: HTMLElement | null,
	ends: MorphEnds
): [string, HTMLElement][] {
	// A source without a container stays live: nothing leaves it.
	const hasFlights = ends.isClosing || ends.openSource !== null;
	const flying: [string, HTMLElement][] = [];
	if (!from || !hasFlights) return flying;
	for (const entry of keyedValues(from)) {
		if (isFullyVisible(entry[1]) && ends.landsOnClose(entry[0]))
			flying.push(entry);
	}
	return flying;
}

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
 * between the ends (`morph-grow` on open, `morph-shrink` on close). A source
 * with a container ({@link hasContainer}) is replaced by a ghost of its
 * surface that grows into the target, while its own content
 * (`jf-morph-source`, its surface stripped: {@link MORPH_STRIPPED}) fades in
 * place, under the growing surface; a source without one stays live and
 * the target grows out of its box. A close is the reverse. Each keyed
 * value of the source (a table cell) flies into the target's value with the
 * same key (a sheet field), each named by its key (`jf-morph-part-<key>`,
 * class `jf-morph-part`). An open's source
 * keeps its look for the transition ({@link MORPH_PINNED}).
 *
 * A closing overlay (`direction: "close"`) offers a handoff (see
 * {@link claimHandoff}). A
 * handed-off target's look joins later and wins, so the target decides.
 */
export function morph(options: MorphOptions): Promise<{ handedOff: boolean }> {
	let captured: Handoff | undefined;
	const ends = new MorphEnds(options);
	const from = ends.ghost && !ends.isClosing ? ends.ghost : options.from;
	const title = fullyVisibleOrNull(titleIn(options.from));
	const values = flyingValues(options.from, ends);
	const done = moveName({
		from,
		to: (scope) => ends.resolve(scope),
		name: "jf-morph",
		also: [
			{
				from: ends.openSource,
				to: () => ends.closeSource,
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
			...values.map(([key, value]) => ({
				from: value,
				to: () => ends.valueFor(key),
				name: partName(key),
			})),
		],
		kind: "morph",
		update: (scope) => {
			ends.removeOpenGhost();
			captured = handoffOf(scope);
			if (ends.isClosing) captured.open = true;
			// A close's look waits for its target (resolve).
			if (!ends.isClosing) scope.kind(lookKind(ends.openLook));
			return options.update();
		},
	});
	// Offered when the close is asked for, not when its update runs: an
	// overlay opened right after it, in the same task, must find it open.
	const session = runningScope();
	if (ends.isClosing && session) handoffOf(session).open = true;
	return done.then(() => {
		try {
			ends.cleanUp();
		} catch (error) {
			// The caller's own follow-up (a presence's close) must still run.
			surfaceError(error);
		}
		return {
			// Read after the transition: a closer whose name was claimed must
			// not restore focus over the overlay that took over.
			handedOff: Boolean(ends.isClosing && captured?.claimedTarget),
		};
	});
}
