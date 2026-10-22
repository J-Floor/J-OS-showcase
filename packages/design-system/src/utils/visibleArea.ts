/**
 * What of an element is actually on screen. A View Transition snapshot
 * ignores the clipping of the element's ancestors: a table row scrolled
 * sideways is captured whole, its hidden cells painting over whatever sits
 * beside the table (the sidebar), and a morph out of it starts from its full
 * width. These measure the visible part so a morph uses that instead.
 */

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

/** The `clip-path` cutting the `jf-morph-source` snapshot to what of its
 *  element was on screen (viewTransition.scss reads it). */
const SOURCE_CLIP_VAR = "--jf-morph-source-clip";

/** Clips the `jf-morph-source` snapshot to `element`'s on-screen part. */
export function clipSource(element: HTMLElement): void {
	document.documentElement.style.setProperty(
		SOURCE_CLIP_VAR,
		clipInset(element)
	);
}

export function clearSourceClip(): void {
	document.documentElement.style.removeProperty(SOURCE_CLIP_VAR);
}
