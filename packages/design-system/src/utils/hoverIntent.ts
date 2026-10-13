import { getOwner, onCleanup } from "solid-js";

export const HOVER_INTENT_MS = 150;

/**
 * Pointer handlers that fire `fire` only once a mouse or pen pointer has
 * rested on the target for `delayMs`. Leaving earlier cancels it, and a touch
 * is a tap rather than intent, so it never fires. Sweeping across many targets
 * therefore fires none of them. A pending timer is cleared when the owning
 * reactive scope is disposed.
 */
export function createHoverIntent(
	fire: () => void,
	delayMs: number = HOVER_INTENT_MS
): {
	onPointerEnter: (event: PointerEvent) => void;
	onPointerLeave: () => void;
} {
	let timer: ReturnType<typeof setTimeout> | undefined;

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
	}

	if (getOwner()) onCleanup(cancel);

	return {
		onPointerEnter: (event) => {
			if (event.pointerType === "touch") return;
			cancel();
			timer = setTimeout(() => {
				timer = undefined;
				fire();
			}, delayMs);
		},
		onPointerLeave: cancel,
	};
}
