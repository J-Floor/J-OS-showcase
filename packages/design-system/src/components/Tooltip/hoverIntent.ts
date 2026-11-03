/**
 * Let only a moving pointer open the tooltip on hover.
 *
 * zag opens a tooltip on `pointerover` as well as `pointermove`. The browser
 * fires `pointerover` (with no `pointermove`) when layout moves an element
 * under a pointer that is not moving, such as a sheet sliding in under the
 * mouse, and the tooltip then opened on its own. zag skips a `pointerover`
 * whose default is prevented, so cancelling it here, before zag's delegated
 * handler runs, leaves `pointermove` as the one hover event that opens it.
 * `pointerover` has no default action, so nothing else changes.
 */
export function ignoreHoverWithoutMove(trigger: HTMLElement): () => void {
	trigger.addEventListener("pointerover", cancel, { capture: true });
	return () => {
		trigger.removeEventListener("pointerover", cancel, { capture: true });
	};
}

function cancel(event: PointerEvent): void {
	event.preventDefault();
}
