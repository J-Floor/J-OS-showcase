import { CONTENT_EDITABLE, FORM_CONTROL } from "./focusable.ts";

/**
 * A sideways swipe with a finger or a pen, for moving between views (tabs).
 *
 * Decided when the pointer lifts. A gesture the browser takes over (it
 * scrolled, it zoomed) ends in `pointercancel` and is dropped: so the swipe
 * surface must leave horizontal pans to script (`touch-action: pan-y
 * pinch-zoom`), and a vertical drag stays a native scroll.
 *
 * It never starts on content that handles its own gestures: form fields,
 * editable text, native draggables, anything that scrolls sideways, and
 * anything marked with `OWN_GESTURES_ATTR` (a drag-to-move card, a resizable
 * bar, a drawing surface).
 */

/** Marks an element that handles its own pointer drags, so a swipe never
 *  starts inside it. */
export const OWN_GESTURES_ATTR = "data-own-gestures";

/** How far the pointer must travel sideways to count as a swipe. */
const SWIPE_MIN_DISTANCE = 48;

/** How many times longer the horizontal travel must be than the vertical
 *  (about 27 degrees off horizontal at most). */
const HORIZONTAL_RATIO = 2;

const OWN_GESTURE_SELECTOR = [
	FORM_CONTROL,
	CONTENT_EDITABLE,
	'[draggable="true"]',
	`[${OWN_GESTURES_ATTR}]`,
].join(", ");

const SCROLLING_OVERFLOW = new Set(["auto", "scroll"]);

function scrollsSideways(element: Element): boolean {
	return (
		SCROLLING_OVERFLOW.has(getComputedStyle(element).overflowX) &&
		element.scrollWidth > element.clientWidth
	);
}

/** Whether a gesture starting at `target` belongs to the content under it,
 *  looking from `target` up to `boundary` (inclusive). */
export function ownsGesture(target: Element, boundary: Element): boolean {
	for (
		let element: Element | null = target;
		element !== null;
		element = element.parentElement
	) {
		if (element.matches(OWN_GESTURE_SELECTOR) || scrollsSideways(element))
			return true;
		if (element === boundary) return false;
	}
	return false;
}

/** The way the finger went, when a move counts as a swipe. */
export type SwipeDirection = "left" | "right";

export function swipeDirection(
	dx: number,
	dy: number
): SwipeDirection | undefined {
	const across = Math.abs(dx);
	const isSwipe =
		across >= SWIPE_MIN_DISTANCE &&
		across >= HORIZONTAL_RATIO * Math.abs(dy);
	if (!isSwipe) return undefined;
	return dx < 0 ? "left" : "right";
}

export type SwipeOptions = {
	/** Whether a gesture may start at this target (e.g. only on panels). */
	startsHere: (target: Element) => boolean;
	onSwipe: (direction: SwipeDirection) => void;
};

function hasSelection(): boolean {
	const selection = document.getSelection();
	return selection !== null && !selection.isCollapsed;
}

/** Listens on `element` for swipes; returns the cleanup. */
export function listenForSwipe(
	element: HTMLElement,
	options: SwipeOptions
): () => void {
	let start: { id: number; x: number; y: number } | undefined;

	function down(event: PointerEvent): void {
		if (start) {
			// A second finger: a pinch or a mistake, not a swipe.
			start = undefined;
			return;
		}
		const target = event.target;
		if (
			event.pointerType === "mouse" ||
			!event.isPrimary ||
			event.button !== 0 ||
			!(target instanceof Element) ||
			!options.startsHere(target) ||
			ownsGesture(target, element)
		)
			return;
		start = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function up(event: PointerEvent): void {
		if (start?.id !== event.pointerId) return;
		const from = start;
		start = undefined;
		if (hasSelection()) return;
		const direction = swipeDirection(
			event.clientX - from.x,
			event.clientY - from.y
		);
		if (direction) options.onSwipe(direction);
	}

	function cancel(event: PointerEvent): void {
		if (start?.id === event.pointerId) start = undefined;
	}

	element.addEventListener("pointerdown", down);
	element.addEventListener("pointerup", up);
	element.addEventListener("pointercancel", cancel);
	return () => {
		element.removeEventListener("pointerdown", down);
		element.removeEventListener("pointerup", up);
		element.removeEventListener("pointercancel", cancel);
	};
}
