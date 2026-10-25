/**
 * What of an element is actually on screen. A View Transition snapshot
 * ignores the clipping of the element's ancestors: a table row scrolled
 * sideways is captured whole, its hidden cells painting over whatever sits
 * beside the table, and a morph out of it starts from its full
 * width. These measure the visible part so a morph uses that instead.
 */
import { MORPH_HIDDEN } from "./morphNames.ts";

/** True when the element is connected and rendered (has a layout box). It
 *  may still be scrolled out of view: {@link isFullyVisible} says whether
 *  all of it is on screen. */
export function hasLayoutBox(
	element: Element | null | undefined
): element is HTMLElement {
	return (
		element instanceof HTMLElement &&
		element.isConnected &&
		element.getClientRects().length > 0
	);
}

/** Hidden or faded out by its own style or an ancestor's, without the
 *  browser's `checkVisibility`: hiding by visibility inherits, a zero
 *  opacity does not. */
function isStyledHidden(element: Element): boolean {
	if (getComputedStyle(element).visibility !== "visible") return true;
	for (let node: Element | null = element; node; node = node.parentElement) {
		if (getComputedStyle(node).opacity === "0") return true;
	}
	return false;
}

/** Shown by its own style and its ancestors': the browser's
 *  `checkVisibility` where there is one. */
function isShown(element: Element): boolean {
	if (typeof element.checkVisibility === "function") {
		return element.checkVisibility({
			visibilityProperty: true,
			opacityProperty: true,
		});
	}
	return !isStyledHidden(element);
}

/**
 * Painted where it sits: rendered, not `visibility: hidden` and not faded to
 * nothing. A closed popup can keep its layout box (an Ark menu closes to
 * `visibility: hidden` and `scale(0)`), so a layout box alone is not enough.
 * A morph source hidden while its overlay is open ({@link MORPH_HIDDEN})
 * takes its visibility from its parent, since it shows again as the overlay
 * closes into it; its own opacity still counts.
 */
export function isVisible(element: HTMLElement): boolean {
	if (!hasLayoutBox(element)) return false;
	if (!element.hasAttribute(MORPH_HIDDEN)) return isShown(element);
	const parent = element.parentElement;
	return (
		parent !== null &&
		isShown(parent) &&
		getComputedStyle(element).opacity !== "0"
	);
}

/** The attributes a trigger names its popup in. Ark drops `aria-controls`
 *  while the popup's content is unmounted and keeps `data-controls`. */
const CONTROLS = ["aria-controls", "data-controls"];

function controls(candidate: Element, id: string): boolean {
	return CONTROLS.some((name) =>
		candidate.getAttribute(name)?.split(/\s+/).includes(id)
	);
}

/** The control that names `popup` as what it opens: a visible one first. An
 *  invisible one (a submenu's trigger inside its closed parent menu) still
 *  counts, so the walk can go on out from it. */
function triggerOf(popup: Element): HTMLElement | null {
	if (!popup.id) return null;
	const selector = CONTROLS.map((name) => `[${name}]`).join(", ");
	const matches = [
		...popup.ownerDocument.querySelectorAll<HTMLElement>(selector),
	].filter((candidate) => controls(candidate, popup.id));
	return (
		matches.find((candidate) => isVisible(candidate)) ??
		matches.at(0) ??
		null
	);
}

/** The trigger of the nearest popup `element` sits in, if any. */
function enclosingTrigger(element: HTMLElement): HTMLElement | null {
	for (
		let ancestor = element.parentElement;
		ancestor;
		ancestor = ancestor.parentElement
	) {
		const trigger = triggerOf(ancestor);
		if (trigger) return trigger;
	}
	return null;
}

/**
 * Where a morph can land for `element`: the element itself if it is
 * visible, else the trigger of the closed popup it sits in (a menu item
 * once its menu has closed), walking out through nested popups. Null when
 * nothing on that chain is visible.
 */
export function nearestVisibleAnchor(
	element: HTMLElement | null | undefined
): HTMLElement | null {
	const seen = new Set<HTMLElement>();
	for (
		let current = element ?? null;
		current && !seen.has(current);
		current = enclosingTrigger(current)
	) {
		if (isVisible(current)) return current;
		seen.add(current);
	}
	return null;
}

/** Sub-pixel slack: a box this close to fully visible counts as fully. */
const VISIBLE_SLACK_PX = 1;

function clipsOn(style: CSSStyleDeclaration): { x: boolean; y: boolean } {
	return {
		x: style.overflowX !== "visible",
		y: style.overflowY !== "visible",
	};
}

/** `element`'s border box cut to the viewport and every ancestor that clips. */
export function visibleRect(element: HTMLElement): DOMRect {
	const box = element.getBoundingClientRect();
	let left = Math.max(box.left, 0);
	let top = Math.max(box.top, 0);
	let right = Math.min(box.right, window.innerWidth);
	let bottom = Math.min(box.bottom, window.innerHeight);
	for (
		let ancestor = element.parentElement;
		ancestor && ancestor !== document.body;
		ancestor = ancestor.parentElement
	) {
		const clips = clipsOn(getComputedStyle(ancestor));
		if (!clips.x && !clips.y) continue;
		const clip = ancestor.getBoundingClientRect();
		if (clips.x) {
			left = Math.max(left, clip.left);
			right = Math.min(right, clip.right);
		}
		if (clips.y) {
			top = Math.max(top, clip.top);
			bottom = Math.min(bottom, clip.bottom);
		}
	}
	return new DOMRect(
		left,
		top,
		Math.max(0, right - left),
		Math.max(0, bottom - top)
	);
}

/** Every bit of `element` is on screen: a value that may fly as it is. */
export function isFullyVisible(element: HTMLElement): boolean {
	const box = element.getBoundingClientRect();
	const visible = visibleRect(element);
	return (
		visible.width >= box.width - VISIBLE_SLACK_PX &&
		visible.height >= box.height - VISIBLE_SLACK_PX
	);
}

/**
 * The `clip-path` that cuts a snapshot of `element`'s whole border box down
 * to its visible part, or `none` when all of it is visible.
 */
export function clipInset(element: HTMLElement): string {
	if (isFullyVisible(element)) return "none";
	const box = element.getBoundingClientRect();
	const visible = visibleRect(element);
	const insets = [
		visible.top - box.top,
		box.right - visible.right,
		box.bottom - visible.bottom,
		visible.left - box.left,
	];
	return `inset(${insets.join("px ")}px)`;
}

/** `element` if all of it is on screen: only that may fly or be flown into. */
export function fullyVisibleOrNull(
	element: HTMLElement | null
): HTMLElement | null {
	return element && isFullyVisible(element) ? element : null;
}
