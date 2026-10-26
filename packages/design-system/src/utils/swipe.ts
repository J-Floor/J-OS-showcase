import { CONTENT_EDITABLE, FORM_CONTROL } from "./focusable.ts";

/**
 * A swipe with a finger or a pen: sideways, for moving between views (tabs),
 * or vertical, for dismissing a bottom sheet.
 *
 * Decided when the pointer lifts. A gesture the browser takes over (it
 * scrolled, it zoomed) ends in `pointercancel` and is dropped: so the swipe
 * surface must leave pans along the swipe's axis to script (`touch-action:
 * pan-y pinch-zoom` for a sideways swipe, `pan-x pinch-zoom` for a vertical
 * one), and a drag along the other axis stays a native scroll.
 *
 * It never starts on content that handles its own gestures: form fields,
 * editable text, native draggables, anything that scrolls along the swipe's
 * axis, and anything marked with `OWN_GESTURES_ATTR` (a drag-to-move card, a
 * resizable bar, a drawing surface).
 */

/** Marks an element that handles its own pointer drags, so a swipe never
 *  starts inside it. */
export const OWN_GESTURES_ATTR = "data-own-gestures";

/** How far the pointer must travel along the axis to count as a swipe. */
export const SWIPE_MIN_DISTANCE = 48;

/** How many times longer the travel along the swipe's axis must be than
 *  across it (about 27 degrees off the axis at most). */
const AXIS_RATIO = 2;

const OWN_GESTURE_SELECTOR = [
	FORM_CONTROL,
	CONTENT_EDITABLE,
	'[draggable="true"]',
	`[${OWN_GESTURES_ATTR}]`,
].join(", ");

const SCROLLING_OVERFLOW = new Set(["auto", "scroll"]);

/** The axis a swipe runs along. */
export type SwipeAxis = "horizontal" | "vertical";

function scrollsAlong(element: Element, axis: SwipeAxis): boolean {
	const style = getComputedStyle(element);
	return axis === "horizontal"
		? SCROLLING_OVERFLOW.has(style.overflowX) &&
				element.scrollWidth > element.clientWidth
		: SCROLLING_OVERFLOW.has(style.overflowY) &&
				element.scrollHeight > element.clientHeight;
}

/** Whether a gesture starting at `target` belongs to the content under it,
 *  looking from `target` up to `boundary` (inclusive). */
export function ownsGesture(
	target: Element,
	boundary: Element,
	axis: SwipeAxis = "horizontal"
): boolean {
	for (
		let element: Element | null = target;
		element !== null;
		element = element.parentElement
	) {
		if (
			element.matches(OWN_GESTURE_SELECTOR) ||
			scrollsAlong(element, axis)
		)
			return true;
		if (element === boundary) return false;
	}
	return false;
}

/** The way the finger went, in a sideways swipe. */
export type SwipeDirection = "left" | "right";

/** The way the finger went, in a vertical swipe. */
export type VerticalSwipeDirection = "up" | "down";

function isAlongAxis(along: number, across: number): boolean {
	return (
		Math.abs(along) >= SWIPE_MIN_DISTANCE &&
		Math.abs(along) >= AXIS_RATIO * Math.abs(across)
	);
}

export function swipeDirection(
	dx: number,
	dy: number
): SwipeDirection | undefined {
	if (!isAlongAxis(dx, dy)) return undefined;
	return dx < 0 ? "left" : "right";
}

export function verticalSwipeDirection(
	dx: number,
	dy: number
): VerticalSwipeDirection | undefined {
	if (!isAlongAxis(dy, dx)) return undefined;
	return dy < 0 ? "up" : "down";
}

export type SwipeOptions<Direction = SwipeDirection> = {
	/** Whether a gesture may start at this target (e.g. only on panels). */
	startsHere: (target: Element) => boolean;
	onSwipe: (direction: Direction) => void;
};

function hasSelection(): boolean {
	const selection = document.getSelection();
	return selection !== null && !selection.isCollapsed;
}

/** Listens on `element` for the swipes `decide` accepts; returns the
 *  cleanup. */
function listen<Direction>(
	element: HTMLElement,
	axis: SwipeAxis,
	decide: (dx: number, dy: number) => Direction | undefined,
	options: SwipeOptions<Direction>
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
			ownsGesture(target, element, axis)
		)
			return;
		start = { id: event.pointerId, x: event.clientX, y: event.clientY };
	}

	function up(event: PointerEvent): void {
		if (start?.id !== event.pointerId) return;
		const from = start;
		start = undefined;
		if (hasSelection()) return;
		const direction = decide(
			event.clientX - from.x,
			event.clientY - from.y
		);
		if (direction !== undefined) options.onSwipe(direction);
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

/** Listens on `element` for sideways swipes; returns the cleanup. */
export function listenForSwipe(
	element: HTMLElement,
	options: SwipeOptions
): () => void {
	return listen(element, "horizontal", swipeDirection, options);
}

/** Listens on `element` for up and down swipes; returns the cleanup. */
export function listenForVerticalSwipe(
	element: HTMLElement,
	options: SwipeOptions<VerticalSwipeDirection>
): () => void {
	return listen(element, "vertical", verticalSwipeDirection, options);
}
